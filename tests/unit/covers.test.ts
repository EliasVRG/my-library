import { describe, expect, it } from "vitest";
import { Covers, coverIsCurrent, coverPage } from "../../src/lib/pdf/covers";
import { openEstanteDb } from "../../src/lib/db/idb";
import { LocalStore } from "../../src/lib/db/repo";
import type { PdfFiles } from "../../src/lib/pdf/files";

const K = "books/x/pdf-1";

describe("coverPage", () => {
  it("primeira página por padrão, outra se escolhida, nenhuma se colorida ou sem PDF", () => {
    expect(coverPage({ pdf_key: K, cover_page: null })).toBe(1);
    expect(coverPage({ pdf_key: K, cover_page: 7 })).toBe(7);
    expect(coverPage({ pdf_key: K, cover_page: 0 })).toBeNull();
    expect(coverPage({ pdf_key: null, cover_page: null })).toBeNull();
  });
});

describe("coverIsCurrent", () => {
  it("vale só para o mesmo PDF e a mesma página", () => {
    const book = { pdf_key: K, cover_page: null };
    expect(coverIsCurrent(book, { key: K, page: 1 })).toBe(true);
    expect(coverIsCurrent(book, { key: "books/x/pdf-2", page: 1 })).toBe(false);
    expect(coverIsCurrent({ ...book, cover_page: 3 }, { key: K, page: 1 })).toBe(false);
    expect(coverIsCurrent({ ...book, cover_page: 0 }, { key: K, page: 1 })).toBe(false);
    expect(coverIsCurrent(book, undefined)).toBe(false);
  });
});

let n = 0;
describe("Covers", () => {
  it("lista as capas válidas e as que faltam (só com PDF no aparelho)", async () => {
    const store = await LocalStore.open(await openEstanteDb(`capas-${++n}`), () => 1000, { localOnly: true });
    const a = await store.createBook({ title: "A", file: new File(["%PDF"], "a.pdf") });
    const b = await store.createBook({ title: "B", file: new File(["%PDF"], "b.pdf") });
    const c = await store.createBook({ title: "C" });
    await store.db.put("covers", { book_id: a.id, key: a.pdf_key!, page: 1, blob: new Blob(["jpg"]), made_at: 1 });
    const covers = new Covers(store, {} as PdfFiles);
    const books = await store.listBooks();
    const urls = await covers.index(books);
    expect([...urls.keys()]).toEqual([a.id]);
    // B tem PDF no aparelho e não tem capa; C não tem PDF.
    const offline = new Map([[a.id, 4], [b.id, 4]]);
    expect((await covers.missing(books, offline)).map((x) => x.title)).toEqual(["B"]);
    // Escolher outra página invalida a capa de A.
    await store.updateBook(a.id, { cover_page: 5 });
    const after = await store.listBooks();
    expect([...(await covers.index(after)).keys()]).toEqual([]);
    expect((await covers.missing(after, offline)).map((x) => x.title).sort()).toEqual(["A", "B"]);
    // Excluir o livro apaga a capa.
    await store.deleteBook(a.id);
    expect(await store.db.get("covers", a.id)).toBeUndefined();
    void c;
  });
});
