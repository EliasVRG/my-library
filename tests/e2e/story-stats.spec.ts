import { expect, test } from "@playwright/test";
import { openBook, openShelf } from "./helpers";

test.beforeEach(async ({ page }) => openShelf(page));

test("meta do ano aparece nas estatísticas e no story Terminei de ler", async ({ page }) => {
  await page.getByRole("button", { name: "Estatísticas" }).click();
  const stats = page.locator("dialog.stats");
  await expect(stats.locator(".kpi").first()).toContainText(/Livros lidos\s*\d+/);
  await stats.getByLabel(/Meta de livros/).fill("12");
  await stats.getByLabel(/Meta de livros/).press("Enter");
  await expect(stats.getByRole("meter")).toHaveAttribute("aria-valuemax", "12");
  await page.keyboard.press("Escape");

  await openBook(page, "Dom Casmurro");
  await page.getByRole("button", { name: "Compartilhar no story" }).click();
  const sheet = page.locator("dialog.story");
  await sheet.getByText("Terminei de ler").click();
  await expect(sheet.locator(".story-preview img")).toHaveAttribute("alt", /Livro \d+ de 12 da meta de \d{4}/);
});

test("o story baixa uma imagem PNG com o nome do livro", async ({ page }) => {
  await openBook(page, "Dom Casmurro");
  await page.getByRole("button", { name: "Compartilhar no story" }).click();
  const sheet = page.locator("dialog.story");
  await expect(sheet.locator(".story-preview img")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), sheet.getByRole("button", { name: "Baixar imagem" }).click()]);
  expect(download.suggestedFilename()).toBe("resenha-dom-casmurro.png");
});

test("data de término editada move o livro de mês nas estatísticas", async ({ page }) => {
  const year = new Date().getFullYear();
  await openBook(page, "O Alienista");
  await page.getByLabel("Terminei em").fill(`${year}-02-03`);
  await page.getByLabel("Terminei em").dispatchEvent("change");
  await page.locator(".deskhead button").first().click();
  await page.getByRole("button", { name: "Estatísticas" }).click();
  await expect(page.locator('.mcol[aria-label^="fevereiro"]')).toHaveAttribute("aria-label", "fevereiro: 1 livro");
});
