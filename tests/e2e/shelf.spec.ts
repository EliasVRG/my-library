import { expect, test } from "@playwright/test";
import { addBook, openShelf } from "./helpers";

test.beforeEach(async ({ page }) => openShelf(page));

test("coleção vira uma pilha, abre os volumes em ordem e pode ser renomeada", async ({ page }) => {
  const pile = page.locator(".stack");
  await expect(pile).toHaveCount(1);
  await expect(pile).toHaveAttribute("aria-label", "Coleção Trilogia indianista: 3 volumes, 1 lidos");

  // Volume novo na mesma coleção: o número é sugerido sozinho.
  await page.getByRole("button", { name: "+ Adicionar" }).click();
  const d = page.locator("dialog[open]");
  await d.getByLabel("Título").fill("Senhora");
  await d.getByLabel(/Coleção/).fill("Trilogia indianista");
  await d.getByLabel(/Coleção/).blur();
  await expect(d.getByLabel("Volume")).toHaveValue("4");
  await d.locator('button[type="submit"]').click();
  await expect(pile).toHaveAttribute("aria-label", /4 volumes/);

  await pile.click();
  await expect(page.locator(".series-head h2")).toHaveText("Trilogia indianista");
  await expect(page.locator(".vol .vol-n")).toHaveText(["Vol. 1", "Vol. 2", "Vol. 3", "Vol. 4"]);
  await page.getByRole("button", { name: "Sair da coleção" }).click();

  await page.getByRole("button", { name: "Dados", exact: true }).click();
  const dados = page.locator("dialog[open]");
  await dados.getByRole("button", { name: "Renomear coleção Trilogia indianista" }).click();
  await dados.locator(".rename-form input").fill("Indianistas");
  await dados.getByRole("button", { name: "Salvar" }).click();
  await expect(dados.getByText("Renomeado para “Indianistas” em 4 livros.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pile).toHaveAttribute("aria-label", /^Coleção Indianistas/);
});

test("categorias além das 5 mais usadas ficam em Mais, com busca", async ({ page }) => {
  // Com duas categorias novas, as abas são Romance (a mais usada) e as quatro primeiras em ordem
  // alfabética entre as de 1 livro; Novela e Poesia vão para "Mais".
  for (const c of ["Arte", "Biografia"]) await addBook(page, { title: `Livro de ${c}`, category: c });
  await page.getByRole("button", { name: /^Mais/ }).click();
  await expect(page.locator(".more-pop li button")).toHaveText([/Novela/, /Poesia/]);
  await page.getByLabel("Buscar categoria").fill("poe");
  await expect(page.locator(".more-pop li button")).toHaveCount(1);
  await page.getByLabel("Buscar categoria").press("Enter");
  await expect(page.locator('.cat-tab[aria-pressed="true"]')).toContainText("Poesia");
  await expect(page.locator(".grid .item")).toHaveCount(1);
});

test("renomear categoria para uma existente junta as duas", async ({ page }) => {
  await page.getByRole("button", { name: "Dados", exact: true }).click();
  const dados = page.locator("dialog[open]");
  await dados.getByRole("button", { name: "Renomear categoria Novela" }).click();
  await dados.locator(".rename-form input").fill("romance");
  await expect(dados.getByText("Já existe “Romance”: o livro vai para lá.")).toBeVisible();
  await dados.getByRole("button", { name: "Juntar" }).click();
  await expect(dados.getByText("“Novela” juntou-se a “Romance” (1 livro).")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cats")).not.toContainText("Novela");
});
