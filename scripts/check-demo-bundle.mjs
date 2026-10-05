// Garante que o build demo não fala com nenhum backend: nenhum arquivo de dist-demo/ pode
// conter "/api/", e o motor de sincronização só pode estar no pedaço da página /demo/sync.
// Uso: node scripts/check-demo-bundle.mjs (roda no fim de `npm run build:demo`).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../dist-demo/", import.meta.url).pathname;
const TEXT = /\.(m?js|css|html|json|webmanifest|txt|map)$/;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (TEXT.test(name)) files.push(p);
  }
})(root);

const offenders = files.filter((f) => readFileSync(f, "utf8").includes("/api/"));

// Marcas do motor (mensagens que só existem em src/lib/sync/engine.ts).
const ENGINE = "Sua sessão expirou. Entre de novo para sincronizar.";
const html = readFileSync(join(root, "index.html"), "utf8");
const entry = /<script type="module"[^>]*src="\/([^"]+)"/.exec(html)?.[1];
const withEngine = files.filter((f) => readFileSync(f, "utf8").includes(ENGINE)).map((f) => relative(root, f));
const entryHasEngine = entry ? readFileSync(join(root, entry), "utf8").includes(ENGINE) : true;

console.log(`dist-demo: ${files.length} arquivos de texto conferidos`);
console.log(`  "/api/": ${offenders.length ? offenders.map((f) => relative(root, f)).join(", ") : "nenhuma ocorrência"}`);
console.log(`  motor de sincronização: ${withEngine.length ? withEngine.join(", ") : "ausente"}${entry ? ` (entrada: ${entry}${entryHasEngine ? ", CONTÉM o motor" : ", sem o motor"})` : ""}`);

if (offenders.length || entryHasEngine || withEngine.some((f) => !/SyncDemo/.test(f))) {
  console.error("Falhou: o build demo não pode chamar /api nem carregar o motor fora de /demo/sync.");
  process.exit(1);
}
