import { describe, expect, it } from "vitest";
import { hasReview, pdfState } from "../../shared/model";
import { DEMO_PDFS, resetDemo, seedDemo } from "../../src/demo/seed";
import { openEstanteDb } from "../../src/lib/db/idb";
import { LocalStore } from "../../src/lib/db/repo";
import { PdfFiles } from "../../src/lib/pdf/files";

let n = 0;
const fresh = async () => LocalStore.open(await openEstanteDb(`demo-${++n}`), Date.now, { localOnly: true });

/** Simula o servidor estático: só `dom-casmurro.pdf` existe; o resto cai no index.html da SPA. */
const fakeFetch = (async (url: string) => {
  if (String(url).endsWith("/dom-casmurro.pdf")) {
    return new Response(null, { headers: { "content-type": "application/pdf", "content-length": "1234" } });
  }
  return new Response("<!doctype html>", { headers: { "content-type": "text/html" } });
}) as typeof fetch;

describe("estante de exemplo", () => {
  it("tem 8 livros, as 4 situações, progresso e 3 resenhas", async () => {
    const store = await fresh();
    await seedDemo(store, fakeFetch);
    const books = await store.listBooks();
    expect(books).toHaveLength(8);
    expect(new Set(books.map((b) => b.status))).toEqual(new Set(["lendo", "lido", "quero", "pausado"]));
    expect(books.some((b) => b.status === "lendo" && b.pages > 0 && b.current_page > 1)).toBe(true);
    const reviews = await store.listReviews();
    expect(reviews.filter(hasReview)).toHaveLength(3);
    expect(new Set(books.map((b) => b.category)).size).toBeGreaterThanOrEqual(4);
  });

  it("só dá PDF aos livros cujo arquivo existe de fato (a SPA devolve HTML para o resto)", async () => {
    const store = await fresh();
    await seedDemo(store, fakeFetch);
    const withPdf = (await store.listBooks()).filter((b) => pdfState(b) === "ready");
    expect(withPdf.map((b) => b.file_name)).toEqual(["dom-casmurro.pdf"]);
    expect(withPdf[0].pdf_size).toBe(1234);
    expect(Object.keys(DEMO_PDFS)).toContain(withPdf[0].id);
  });

  it("restaurar apaga o que o visitante fez e recoloca o exemplo", async () => {
    const store = await fresh();
    await seedDemo(store, fakeFetch);
    await store.createBook({ title: "Meu livro", file: new File(["x"], "meu.pdf") });
    const first = (await store.listBooks())[0];
    await store.deleteBook(first.id);
    await resetDemo(store, fakeFetch);
    const books = await store.listBooks();
    expect(books).toHaveLength(8);
    expect(books.some((b) => b.title === "Meu livro")).toBe(false);
    expect(await store.db.count("pdfs")).toBe(0);
  });
});

describe("LocalStore localOnly (demo)", () => {
  it("não enfileira nada e deixa o PDF enviado pronto na hora", async () => {
    const store = await fresh();
    const b = await store.createBook({ title: "Local", file: new File(["%PDF"], "local.pdf") });
    await store.updateBook(b.id, { current_page: 2 });
    await store.updateReview(b.id, { resumo: "só aqui" });
    await store.deleteBook((await store.createBook({ title: "Some" })).id);
    expect(await store.outbox()).toHaveLength(0);
    expect(pdfState((await store.getBook(b.id))!)).toBe("ready");
  });

  it("não deixa liberar o único arquivo de um PDF enviado na demo", async () => {
    const store = await fresh();
    const b = await store.createBook({ title: "Local", file: new File(["%PDF"], "local.pdf") });
    const files = new PdfFiles(store, fakeFetch as never, (id) => id in DEMO_PDFS);
    expect(await files.release(b.id)).toBe(false);
    expect(await files.releaseAll()).toBe(0);
    expect(await store.db.get("pdfs", b.id)).toBeTruthy();
  });
});
