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

test("no celular: arrastar o dedo para os lados vira a página, rolar na vertical não", async ({ page, context }) => {
  await openShelf(page);
  await openTestBook(page);
  const cdp = await context.newCDPSession(page);
  // Toque de verdade (com o tratamento de rolagem do navegador), não um evento sintético.
  async function drag(x0: number, y0: number, x1: number, y1: number) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / 8, y: y0 + ((y1 - y0) * i) / 8 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  const page1 = () => page.locator(".rbar input").inputValue();
  await drag(320, 450, 80, 455);
  await expect.poll(page1).toBe("2");
  await drag(80, 450, 320, 455);
  await expect.poll(page1).toBe("1");
  // O mesmo gesto não pode virar "voltar" do navegador e fechar o livro.
  await expect(page.locator(".desk")).toBeVisible();
  await drag(200, 600, 205, 300);
  await page.waitForTimeout(300);
  expect(await page1()).toBe("1");
});

test("no celular: margens em branco são cortadas e o texto ocupa a largura", async ({ page }) => {
  await openShelf(page);
  await openTestBook(page);
  const box = (await page.locator(".pagebox").boundingBox())!;
  const canvas = (await page.locator(".pagebox canvas").boundingBox())!;
  const width = page.viewportSize()!.width;
  // A janela ocupa a largura útil; a página desenhada é maior (as margens ficam de fora).
  expect(box.width).toBeGreaterThan(width * 0.8);
  expect(canvas.width).toBeGreaterThan(box.width * 1.2);
});
