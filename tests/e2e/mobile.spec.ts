import { expect, test } from "@playwright/test";
import { openShelf, openTestBook } from "./helpers";

test("no celular: barra do leitor cabe na tela e busca funciona", async ({ page }) => {
  await openShelf(page);
  await openTestBook(page);
  const bar = (await page.locator(".rbar").boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(bar.x).toBeGreaterThanOrEqual(0);
  expect(bar.x + bar.width).toBeLessThanOrEqual(width);
  await page.getByRole("button", { name: "Buscar no livro" }).click();
  await page.locator(".findbar input").fill("ressaca");
  await expect(page.locator(".findcount")).toHaveText(/^\d+\/3$/);
});

test("no celular: o story abre como folha de baixo", async ({ page }) => {
  await openShelf(page);
  await page.locator(".grid .item", { hasText: "Dom Casmurro" }).click();
  await page.getByRole("tab", { name: "Resenha" }).click();
  await page.getByRole("button", { name: "Compartilhar no story" }).click();
  const panel = page.locator("dialog.story .panel");
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  // Encostada embaixo, ocupando a largura toda.
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(page.viewportSize()!.height - 2);
  expect(Math.round(box.width)).toBe(page.viewportSize()!.width);
});
