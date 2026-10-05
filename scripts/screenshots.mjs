// Gera os screenshots do README a partir do build demo.
// Uso: npm run screenshots            (faz o build demo antes)
//      npm run screenshots -- --no-build
// Precisa de um Chromium: `npx playwright install chromium`, ou usa o Google Chrome instalado.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";

const root = new URL("..", import.meta.url).pathname;
const out = `${root}docs/screenshots/`;
const PORT = 4180;
const BASE = `http://localhost:${PORT}`;
const args = new Set(process.argv.slice(2));

if (!args.has("--no-build")) {
  const r = spawnSync("npm", ["run", "build:demo"], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (!existsSync(`${root}dist-demo/demo/memorias-postumas-de-bras-cubas.pdf`)) {
  console.error("Faltam os PDFs de exemplo (o leitor sairia vazio). Rode `npm run demo:pdfs` para ver o que baixar.");
  process.exit(1);
}

const server = spawn("npx", ["vite", "preview", "--mode", "demo", "--port", String(PORT), "--strictPort"], {
  cwd: root,
  stdio: "ignore",
  detached: true,
});
const stop = () => {
  try {
    process.kill(-server.pid);
  } catch {}
};
process.on("exit", stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("vite preview não subiu");
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" }); // Chrome do sistema, se o Chromium do Playwright não estiver instalado
  }
}

mkdirSync(out, { recursive: true });
const report = [];

async function save(page, name, opts = {}) {
  await page.evaluate(() => document.fonts.ready);
  const raw = await page.screenshot(opts);
  // Paleta de 256 cores + compressão máxima: a interface tem poucas cores, a perda não aparece.
  const png = await sharp(raw).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer();
  writeFileSync(`${out}${name}.png`, png);
  report.push(`${name}.png  ${(raw.length / 1024).toFixed(0)} KB → ${(png.length / 1024).toFixed(0)} KB`);
}

async function newPage(browser, { width, height, dark = false, scale = 1 }) {
  // Sem service worker: evita o aviso "Pronto para funcionar offline" nas capturas.
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: dark ? "dark" : "light",
    serviceWorkers: "block",
    reducedMotion: "reduce", // sem transições pela metade nas capturas
  });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.locator(".item").nth(7).waitFor();
  return { ctx, page };
}

async function openReader(page, title) {
  await page.locator(".item", { hasText: title }).click();
  await page.locator(".stage canvas:not([hidden])").waitFor();
  await page.waitForTimeout(600); // a página do PDF termina de desenhar
}

try {
  await waitForServer();
  const browser = await launch();

  // Estante, claro e escuro
  for (const dark of [false, true]) {
    const { ctx, page } = await newPage(browser, { width: 1440, height: 1000, dark });
    await save(page, dark ? "shelf-dark" : "shelf-light");
    if (!dark) {
      await openReader(page, "Memórias Póstumas de Brás Cubas");
      await save(page, "reader");
    }
    await ctx.close();
  }

  // Celular (390 px)
  {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844, scale: 2 });
    await save(page, "mobile-shelf");
    await openReader(page, "Memórias Póstumas de Brás Cubas");
    await save(page, "mobile-reader");
    await page.getByRole("tab", { name: "Resenha" }).click();
    await save(page, "mobile-review");
    await ctx.close();
  }

  // Sincronização: antes e depois de reconectar
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 860 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/demo/sync`);
    const pc = page.getByRole("region", { name: "Computador", exact: true });
    const cel = page.getByRole("region", { name: "Celular", exact: true });
    await pc.getByText("Em dia com o servidor").waitFor();
    await cel.getByText("Em dia com o servidor").waitFor();
    await pc.getByRole("button", { name: "Ficar offline" }).click();
    await cel.getByRole("button", { name: "Ficar offline" }).click();
    await pc.getByLabel("Resumo da resenha").fill("Bentinho narra para convencer, não para lembrar.");
    for (let i = 0; i < 8; i++) await cel.getByRole("button", { name: /Próxima página/ }).click();
    await pc.getByText(/Offline · \d na fila/).waitFor();
    await cel.getByText(/Offline · \d na fila/).waitFor();
    await save(page, "sync-before");
    await pc.getByRole("button", { name: "Reconectar" }).click();
    await cel.getByRole("button", { name: "Reconectar" }).click();
    await pc.getByText("Em dia com o servidor").waitFor();
    await cel.getByText("Em dia com o servidor").waitFor();
    await page.waitForFunction(() => {
      const pages = [...document.querySelectorAll(".pnum")].map((e) => e.textContent?.trim());
      const notes = [...document.querySelectorAll("section.device textarea")].map((e) => e.value);
      return pages.length === 2 && pages[0] === pages[1] && notes[0] === notes[1] && notes[0] !== "";
    });
    await save(page, "sync-after");
    await ctx.close();
  }

  await browser.close();
  console.log(`Screenshots em docs/screenshots/:\n  ${report.join("\n  ")}`);
} finally {
  stop();
}
