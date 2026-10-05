# Estante de Leitura

Biblioteca pessoal de PDFs para estudo: estante com filtros, leitor de PDF que lembra a página onde você parou e uma resenha estruturada por livro. É um PWA instalável no computador e no celular, funciona sem internet e sincroniza com a Cloudflare quando a conexão volta.

- **Front:** Svelte 5 + Vite (SPA), IndexedDB (`idb`), `pdfjs-dist`, `vite-plugin-pwa`.
- **Back:** um Cloudflare Worker (Hono) que serve o app (static assets) e a API em `/api/*`, com D1 (dados) e R2 (PDFs).
- **Acesso:** Cloudflare Access na frente do domínio; o Worker também valida o JWT do Access.

> **Por que Worker e não Pages?** A documentação da Cloudflare hoje recomenda começar projetos novos em Workers ("Start new projects with Workers"), que já servem arquivos estáticos e SPA. Assim app, API, D1 e R2 ficam num único deploy e numa única configuração.

## Como funciona a sincronização

- A interface lê e escreve **só no IndexedDB**. Cada alteração entra numa fila de saída (outbox) e sobe em lote, com nova tentativa e espera crescente (backoff). O envio é disparado quando a conexão volta, quando a janela ganha foco, a cada 60 s e logo depois de cada edição.
- Os conflitos são resolvidos **campo a campo**: cada campo guarda o relógio `[timestamp, aparelho]` da última escrita, e a mais recente vence. Avançar páginas no computador e escrever a resenha no celular não se sobrescrevem.
- O cursor de `GET /api/changes?since=` é uma revisão crescente gerada pelo servidor, não o relógio do aparelho. Um celular com a hora errada não faz ninguém perder alterações.
- **Exclusão vence tudo:** um livro excluído não volta, nem por edição posterior em outro aparelho nem por importação de backup. A exclusão apaga também a resenha e o PDF no R2.
- Os PDFs sobem em partes de 10 MB (multipart do R2). Por isso não há limite de tamanho, só o espaço do aparelho. Se a conexão cair, o upload continua da última parte enviada. Todo PDF aberto fica guardado no aparelho para ler offline.

## Pré-requisitos

- Node.js **22.13 ou mais novo**.
- npm **11** (o npm 10.9 quebra ao resolver as dependências deste projeto: `Cannot read properties of null (reading 'edgesOut')`). Use `npm install -g npm@11` ou rode tudo com `npx npm@11 …`.
- Uma conta Cloudflare com um **domínio ativo** nela (o Access protege hostnames do seu domínio).

## Rodar localmente

```sh
npm install
cp .dev.vars.example .dev.vars        # DEV_SKIP_ACCESS=1: pula o Access, só em localhost
npm run db:migrate:local              # cria as tabelas no D1 local
npm run dev                           # http://localhost:5173 (Vite + Worker no workerd)
```

O `npm run dev` usa o `@cloudflare/vite-plugin`: o Worker roda no runtime da própria Cloudflare (workerd), com D1 e R2 locais em `.wrangler/state` e recarregamento automático.

Para testar o build final como ele vai para produção (com service worker e modo offline):

```sh
npm run preview                       # build + wrangler dev em http://localhost:8787
```

Os dois usam o mesmo banco e o mesmo bucket locais. Para zerar tudo: `rm -rf .wrangler/state && npm run db:migrate:local`.

A variável `DEV_SKIP_ACCESS` só tem efeito quando o host é `localhost`, `127.0.0.1` ou `[::1]`. Em qualquer outro host o Worker exige o JWT do Access, mesmo que a variável esteja definida.

### Testes e checagem de tipos

```sh
npm test            # Vitest: merge, fila, upload (Node + fake-indexeddb) e rotas do Worker (workerd com D1/R2)
npm run check       # svelte-check + tsc do Worker
```

## Criar o D1 e o R2

```sh
npx wrangler login
npx wrangler d1 create estante
```

Copie o `database_id` que aparece na saída para `wrangler.jsonc`, dentro de `d1_databases` (o ID não é segredo, mas é por isso que ele não vem no repositório):

```jsonc
"d1_databases": [{ "binding": "DB", "database_name": "estante", "database_id": "COLE-AQUI", "migrations_dir": "migrations" }]
```

Depois crie o bucket e aplique as migrações:

```sh
npx wrangler r2 bucket create estante-pdfs
npm run db:migrate:remote
```

O bucket é privado (não ative acesso público nem domínio `r2.dev`). Os PDFs só saem pelo Worker, depois da validação do Access. Buckets novos já vêm com a regra que descarta uploads multipart incompletos após 7 dias.

Migrações novas vão em `migrations/NNNN_descricao.sql` e são aplicadas com os mesmos comandos `db:migrate:*`.

## Deploy

1. Em `wrangler.jsonc`, troque `estante.example.com` em `routes` pelo (sub)domínio que você vai usar. O `workers_dev` e o `preview_urls` estão desligados: o Access protege o seu domínio, não as URLs `*.workers.dev`.
2. Publique:

   ```sh
   npm run deploy
   ```

   Até você configurar os segredos (passos seguintes), a API responde `500 Access não configurado`. Ela falha fechada.

## Configurar o Cloudflare Access

No painel da Cloudflare, em **Zero Trust** (os nomes de menu às vezes mudam um pouco):

1. **Settings → Team name and domain**: anote o team domain, algo como `https://minha-equipe.cloudflareaccess.com`.
2. **Access controls → Applications → Create new application → Self-hosted and private**:
   - Nome: `Estante de Leitura`.
   - Public hostname: o mesmo domínio do passo de deploy (por exemplo `estante.seudominio.com`), **sem caminho**, para proteger o site inteiro.
   - Session duration: a que preferir (ex.: 1 mês, para não pedir login toda hora no celular).
   - Login method: *One-time PIN* (código por e-mail) já basta.
3. **Policy:** crie uma política com Action **Allow** e regra **Include → Emails → o seu e-mail**. Nenhuma outra regra.
4. Salve e abra a aplicação: copie o **Application Audience (AUD) Tag** (fica em *Overview / Basic information*).
5. Configure os segredos no Worker:

   ```sh
   npx wrangler secret put ACCESS_TEAM_DOMAIN   # https://minha-equipe.cloudflareaccess.com
   npx wrangler secret put ACCESS_AUD           # o AUD Tag do passo 4
   npx wrangler secret put ALLOWED_EMAIL        # seu e-mail (aceita vários, separados por vírgula)
   ```

Pronto: abra o domínio, entre com o código enviado ao seu e-mail e instale o app. No Chrome/Edge do computador use o ícone de instalar na barra de endereço; no Android, "Adicionar à tela inicial"; no iPhone, Safari → Compartilhar → "Adicionar à Tela de Início".

**Sessão expirada:** quando a sessão do Access vence, o app continua funcionando offline e mostra "Entrar de novo". O botão leva a `/api/login`, que o service worker não intercepta, então passa pelo login do Access e volta para o app. As alterações feitas nesse meio-tempo sobem logo depois.

## Backup

- **Pelo app:** *Dados e backup → Exportar .zip*. O zip traz uma resenha por livro em Markdown (com front matter: título, autor, categoria, situação, nota, datas) e o `estante.json` com todos os dados. Marque "Incluir os PDFs" para levar os arquivos também.
- **Restaurar ou migrar:** *Dados e backup → Importar* aceita o `estante.json` ou o próprio zip. Nada é apagado: cada campo fica com a versão mais recente. Se o PDF de um livro ainda existir no R2, ele volta a ficar disponível sozinho.
- **Banco inteiro:** `npx wrangler d1 export estante --remote --output=backups/estante.sql` (a pasta `backups/` está no `.gitignore`). O D1 também tem *Time Travel*: `npx wrangler d1 time-travel restore estante --timestamp=…` volta o banco a um ponto no passado (7 dias no plano gratuito, 30 no pago).
- **PDFs:** ficam no R2. Para uma cópia fora da Cloudflare, crie um token de API do R2 (S3) e use `rclone sync` ou outro cliente S3, ou exporte o zip com PDFs pelo app.

## Limites a conhecer

- O D1 do plano gratuito permite 50 queries por requisição. Por isso o envio vai em lotes de até 20 alterações (o app faz isso sozinho).
- O plano gratuito aceita até 100 MB por requisição. Como cada parte do upload tem 10 MB, isso não limita o tamanho dos PDFs.
- O espaço para PDFs offline é o que o navegador libera ao app. *Dados e backup* mostra o uso e permite liberar PDFs já sincronizados (eles continuam na nuvem). Instalar o app costuma garantir armazenamento persistente.

## Estrutura

```
src/                 front (Svelte 5)
  lib/db/            IndexedDB: schema e repositório (toda escrita da UI passa por aqui)
  lib/sync/          motor de sincronização: outbox, push/pull, upload em partes
  lib/pdf/           pdf.js sob demanda e cache de PDFs offline
  lib/export/        exportar zip / importar json
  lib/components/    estante, card, mesa de leitura, leitor, resenha, diálogos
  styles/            tokens (paleta, fontes, temas) e estilos
shared/              tipos, validação e merge por campo (mesmo código no front e no Worker)
worker/              API Hono: auth do Access, sync, PDFs no R2
migrations/          SQL do D1
tests/unit/          merge, fila, dois aparelhos, upload (Node)
tests/worker/        rotas do Worker em workerd com D1/R2 locais
scripts/make-icons.mjs  gera os ícones PNG do PWA
```

O repositório não guarda PDFs nem dados: `*.pdf`, `*.zip`, `estante*.json`, `.dev.vars` e `.wrangler/` estão no `.gitignore`.
