# PDFs da demo

Coloque aqui três obras em domínio público, baixadas do portal [Domínio Público](http://www.dominiopublico.gov.br) (busque pelo título):

| Arquivo | Obra |
|---|---|
| `dom-casmurro.pdf` | [*Dom Casmurro*](http://www.dominiopublico.gov.br/pesquisa/DetalheObraForm.do?select_action=&co_obra=1888), Machado de Assis |
| `memorias-postumas-de-bras-cubas.pdf` | [*Memórias Póstumas de Brás Cubas*](http://www.dominiopublico.gov.br/pesquisa/DetalheObraForm.do?select_action=&co_obra=2038), Machado de Assis |
| `o-alienista.pdf` | [*O Alienista*](http://www.dominiopublico.gov.br/pesquisa/DetalheObraForm.do?select_action=&co_obra=2027), Machado de Assis |

Depois de colocar os arquivos, rode `npm run demo:pdfs` para conferir e `npm run screenshots` para gerar as imagens do README. Um navegador que já abriu a demo antes liga os PDFs sozinho na próxima visita.

Os PDFs não vão para o git (`*.pdf` está no `.gitignore`). Só o build demo os copia para `/demo/`. Confira com `npm run demo:pdfs`.
