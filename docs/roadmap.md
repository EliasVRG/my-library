# Roteiro

O que falta na Estante, em fases. Cada fase é entregue sozinha, testada, e fica sem commit para revisão.

| Fase | O quê | Situação |
| --- | --- | --- |
| 1 | Texto no PDF: buscar, selecionar, copiar e salvar citação | feita |
| 2 | Marcadores e modo noturno no leitor | feita |
| 3 | Capas a partir da primeira página do PDF | feita |
| 4 | Estatísticas de leitura e meta do ano | a fazer |
| 5 | Testes de navegador (Playwright) no CI | a fazer |
| 6 | Leitura de EPUB | a fazer |

## Fase 1: texto no PDF

O leitor desenha cada página num canvas, então hoje não dá para buscar nem selecionar texto.

- Camada de texto do pdf.js por cima da página: seleção e cópia nativas, inclusive no celular.
- Buscar no livro inteiro (Ctrl/Cmd+F ou botão na barra), ignorando maiúsculas e acentos, com "3 de 27", anterior/próximo e os resultados marcados na página.
- Ao selecionar um trecho: "Copiar" e "Salvar citação", que acrescenta o trecho com a página em "Notas e citações" da resenha.
- Funciona offline e no modo foco (tela cheia).

## Fase 2: marcadores e modo noturno

- Marcar páginas (várias por livro), com lista para pular até elas. Sincroniza como o resto.
- Modo noturno da página do PDF (cores invertidas), lembrado por aparelho, também no modo foco.

## Fase 3: capas de verdade

- Miniatura da primeira página do PDF como capa, gerada no aparelho e guardada offline.
- Livro sem PDF continua com a capa colorida da categoria; opção de voltar à capa colorida por livro.

## Fase 4: estatísticas e meta do ano

- A partir de `started_at`/`finished_at`: livros e páginas por ano e por mês, tempo médio de leitura, categorias mais lidas.
- Meta anual ("12 livros em 2027") com progresso; o story "Terminei de ler" passa a mostrar "Livro 3 de 12 da meta".

## Fase 5: testes de navegador no CI

- Os fluxos verificados à mão com Playwright viram testes no repositório: story, modo foco, coleções, busca e citação.
- Rodam contra o build demo no CI (sem servidor nem Cloudflare).

## Fase 6: EPUB

- Segundo leitor para EPUB (texto que reflui), com página atual, busca e citação equivalentes às do PDF.
- É a maior fase: decidir antes a biblioteca (por exemplo, epub.js ou foliate-js) e como contar o progresso.

## Fora do roteiro

- Backup: o D1 tem recuperação de qualquer momento recente (Time Travel) e o export .zip cobre o resto.
