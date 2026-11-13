// Testes de navegador contra o build demo (sem servidor, sem Cloudflare): cada teste abre um
// navegador limpo, então começa com a estante de exemplo recém-criada.
// Local: `npm run test:e2e` usa o Google Chrome instalado; para usar o Chromium do Playwright,
// `npx playwright install chromium` e `PW_BUNDLED=1 npm run test:e2e`. No CI, sempre o Chromium do Playwright.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4174;
const channel = process.env.CI || process.env.PW_BUNDLED ? undefined : "chrome";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    // O service worker cacheia e pode servir versões antigas entre testes; aqui não interessa.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    channel,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, channel }, testIgnore: /mobile\.spec\.ts/ },
    { name: "celular", use: { ...devices["Pixel 7"], channel }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run build:demo && npx vite preview --mode demo --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
