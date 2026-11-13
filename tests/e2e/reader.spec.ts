import { expect, test } from "@playwright/test";
import { currentPage, openShelf, openTestBook } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openShelf(page);
  await openTestBook(page);
});

test("busca no livro todo, marca e navega entre os resultados", async ({ page }) => {
  await page.keyboard.press("Control+f");
  const input = page.getByLabel("Buscar no livro", { exact: true }).and(page.locator("input"));
  await input.fill("OLHOS DE RESSACA");
  await expect(page.locator(".findcount")).toHaveText("1/2");
  expect(await currentPage(page)).toBe("4");
  await expect(page.locator("mark.hit.now")).toHaveCount(1);
  await input.press("Enter");
  await expect(page.locator(".findcount")).toHaveText("2/2");
  expect(await currentPage(page)).toBe("6");
  await page.getByRole("button", { name: "Fechar busca" }).click();
  await expect(page.locator("mark.hit")).toHaveCount(0);
});

test("seleciona um trecho e salva como citação nas notas", async ({ page }) => {
  const span = page.locator(".textLayer span", { hasText: "Um livro de teste" });
  await span.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.getByRole("button", { name: "Salvar citação" }).click();
  await expect(page.locator(".readnote")).toHaveText("Citação da p. 1 salva em Notas e citações.");
  await expect(page.getByLabel("Notas e citações")).toHaveValue("“Um livro de teste para o leitor.” (p. 1)");
});

test("marcadores sobrevivem a recarregar a página", async ({ page }) => {
  await page.locator(".rbar input").fill("3");
  await page.locator(".rbar input").press("Enter");
  await page.locator(".stage").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("b");
  await expect(page.locator(".pagebox.marked")).toBeVisible();
  await page.reload();
  await expect(page.locator(".textLayer span").first()).toBeAttached();
  await page.getByRole("button", { name: /^Marcadores/ }).click();
  await expect(page.locator(".bmlist li .go")).toHaveText(["Página 3"]);
  await page.locator(".bmlist li .go").click();
  expect(await currentPage(page)).toBe("3");
});

test("modo noturno fica lembrado no aparelho", async ({ page }) => {
  const night = page.getByRole("button", { name: "Modo noturno" });
  await expect(night).toHaveAttribute("aria-pressed", "false");
  await night.click();
  await expect(page.locator(".reader.night")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Modo noturno" })).toHaveAttribute("aria-pressed", "true");
});

test("tela cheia: toques nas bordas viram a página", async ({ page }) => {
  await page.getByRole("button", { name: "Tela cheia" }).click();
  await expect(page.locator(".desk.focus")).toBeVisible();
  const box = (await page.locator(".stage").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  await expect.poll(() => currentPage(page)).toBe("2");
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
  await expect.poll(() => currentPage(page)).toBe("1");
  await page.getByRole("button", { name: "Sair da tela cheia" }).click();
  await expect(page.locator(".desk.focus")).toHaveCount(0);
});

test("capa é gerada da primeira página e pode voltar a ser colorida", async ({ page }) => {
  await page.locator(".deskhead button").first().click();
  const card = page.locator(".grid .item", { hasText: "Livro de teste" });
  await expect(card.locator(".cover.photo img")).toBeVisible();
  await card.click();
  await page.getByLabel("Capa").selectOption("0");
  await page.locator(".deskhead button").first().click();
  await expect(card.locator(".cover.photo")).toHaveCount(0);
});
