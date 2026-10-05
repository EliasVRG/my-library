// Confere os PDFs de exemplo da demo em demo/pdfs/ (fora do git). Não baixa nada.
// Uso: npm run demo:pdfs
import { existsSync, statSync } from "node:fs";

// Páginas das obras no portal Domínio Público (o botão de download fica na página).
const PORTAL = "http://www.dominiopublico.gov.br/pesquisa/DetalheObraForm.do?select_action=&co_obra=";
const WANTED = [
  ["dom-casmurro.pdf", "Dom Casmurro", "Machado de Assis", 1888],
  ["memorias-postumas-de-bras-cubas.pdf", "Memórias Póstumas de Brás Cubas", "Machado de Assis", 2038],
  ["o-alienista.pdf", "O Alienista", "Machado de Assis", 2027],
];
const LIMIT = 2 * 1024 * 1024;
const dir = new URL("../demo/pdfs/", import.meta.url).pathname;
let missing = 0;

for (const [file, title, author, obra] of WANTED) {
  const path = dir + file;
  if (!existsSync(path)) {
    missing++;
    console.log(`✗ ${file} — falta. Baixe "${title}" (${author}) em ${PORTAL}${obra}\n  e salve em demo/pdfs/${file}`);
    continue;
  }
  const size = statSync(path).size;
  const mb = (size / 1048576).toFixed(2);
  console.log(`${size > LIMIT ? "!" : "✓"} ${file} — ${mb} MB${size > LIMIT ? " (acima de 2 MB; funciona, mas pesa na demo)" : ""}`);
}
if (missing) {
  console.log("\nEste script só confere; não baixa nada. Sem esses arquivos a demo funciona, mas esses livros aparecem como \"sem PDF\".");
  process.exitCode = 1;
}
