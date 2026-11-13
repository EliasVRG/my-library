import { expect, type Page } from "@playwright/test";
import { BOOK_PDF } from "./pdf";

/** Abre a estante de exemplo e espera os livros aparecerem. */
export async function openShelf(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Estante", level: 1 })).toBeVisible();
  await expect(page.locator(".grid .item").first()).toBeVisible();
}

/** Adiciona um livro pela tela "+ Adicionar", com o PDF de teste se `pdf` for verdadeiro. */
export async function addBook(page: Page, o: { title: string; author?: string; category?: string; series?: string; pdf?: boolean }) {
  await page.getByRole("button", { name: "+ Adicionar" }).click();
  const d = page.locator("dialog[open]");
  if (o.pdf) await d.locator('input[type="file"]').setInputFiles({ name: "teste.pdf", mimeType: "application/pdf", buffer: BOOK_PDF });
  await d.getByLabel("Título").fill(o.title);
  if (o.author) await d.getByLabel("Autor").fill(o.author);
  if (o.category) await d.getByLabel("Categoria").fill(o.category);
  if (o.series) {
    await d.getByLabel(/Coleção/).fill(o.series);
    await d.getByLabel(/Coleção/).blur();
  }
  await d.locator('button[type="submit"]').click();
  await expect(d).toBeHidden();
}

/** Abre o livro pelo título na grade. */
export async function openBook(page: Page, title: string) {
  await page.locator(".grid .item", { hasText: title }).first().click();
  await expect(page.locator(".desk")).toBeVisible();
}

/** Abre o livro de teste (com PDF) e espera a camada de texto da página. */
export async function openTestBook(page: Page, title = "Livro de teste") {
  await addBook(page, { title, pdf: true });
  await openBook(page, title);
  await expect(page.locator(".textLayer span").first()).toBeAttached();
}

export const currentPage = (page: Page) => page.locator(".rbar input").inputValue();
