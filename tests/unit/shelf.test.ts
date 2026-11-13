import { describe, expect, it } from "vitest";
import { emptyBookData, type Book } from "../../shared/model";
import { categoryCounts, nextVolume, NO_CATEGORY, parseVolume, seriesNames, shelfEntries, volumeLabel } from "../../src/lib/shelf";

let seq = 0;
function book(over: Partial<Book> = {}): Book {
  return { ...emptyBookData(), id: `b${++seq}`, title: `Livro ${seq}`, pdf_ready_key: null, created_at: 1, updated_at: seq, field_clock: {}, rev: 0, ...over } as Book;
}

describe("shelfEntries", () => {
  it("junta os volumes de uma coleção numa pilha, em ordem de volume", () => {
    const hp2 = book({ title: "Câmara Secreta", series: "Harry Potter", series_index: 2, status: "lido", author: "J. K. Rowling" });
    const hp1 = book({ title: "Pedra Filosofal", series: "harry potter ", series_index: 1, status: "lido", author: "J. K. Rowling" });
    const hp3 = book({ title: "Prisioneiro", series: "Harry Potter", series_index: 3, status: "lendo", author: "J. K. Rowling" });
    const solo = book({ title: "Avulso", status: "quero" });
    const entries = shelfEntries([hp2, solo, hp1, hp3]);
    expect(entries).toHaveLength(2);
    const s = entries[0];
    // A pilha fica onde está o volume mais "à frente" (lendo vem antes de quero ler).
    expect(s.kind).toBe("series");
    if (s.kind !== "series") return;
    expect(s.name).toBe("Harry Potter");
    expect(s.books.map((b) => b.title)).toEqual(["Pedra Filosofal", "Câmara Secreta", "Prisioneiro"]);
    expect(s.read).toBe(2);
    expect(s.author).toBe("J. K. Rowling");
    expect(entries[1]).toEqual({ kind: "book", book: solo });
  });

  it("coleção com um volume só continua como livro", () => {
    const only = book({ series: "Duna", series_index: 1 });
    expect(shelfEntries([only])).toEqual([{ kind: "book", book: only }]);
  });

  it("volume sem número vai para o fim, por título", () => {
    const a = book({ title: "B extra", series: "S" });
    const b = book({ title: "A extra", series: "S" });
    const c = book({ title: "Primeiro", series: "S", series_index: 1 });
    const s = shelfEntries([a, b, c])[0];
    expect(s.kind === "series" && s.books.map((x) => x.title)).toEqual(["Primeiro", "A extra", "B extra"]);
  });

  it("autores diferentes: sem autor na capa da coleção", () => {
    const s = shelfEntries([book({ series: "Antologia", author: "A" }), book({ series: "Antologia", author: "B" })])[0];
    expect(s.kind === "series" && s.author).toBe("");
  });
});

describe("categorias", () => {
  it("contam e ordenam das mais usadas para as menos; vazia vira Sem categoria", () => {
    const books = [book({ category: "Economia" }), book({ category: "Romance" }), book({ category: "Romance" }), book({ category: " " }), book({ category: "Arte" })];
    expect(categoryCounts(books)).toEqual([
      ["Romance", 2],
      ["Arte", 1],
      ["Economia", 1],
      [NO_CATEGORY, 1],
    ]);
  });
});

describe("volumes", () => {
  it("sugere o próximo número livre da coleção", () => {
    const books = [book({ series: "HP", series_index: 1 }), book({ series: "hp", series_index: 2.5 })];
    expect(nextVolume(books, "Hp")).toBe(3);
    expect(nextVolume(books, "Outra")).toBe(1);
    expect(nextVolume(books, " ")).toBeNull();
  });
  it("lê o número digitado com vírgula ou ponto", () => {
    expect(parseVolume("2")).toBe(2);
    expect(parseVolume("2,5")).toBe(2.5);
    expect(parseVolume(" ")).toBeNull();
    expect(parseVolume("abc")).toBeNull();
    expect(parseVolume("-1")).toBeNull();
    expect(volumeLabel(2.5)).toBe("Vol. 2,5");
    expect(volumeLabel(null)).toBe("");
  });
  it("lista cada nome de coleção uma vez, com a grafia mais usada", () => {
    expect(seriesNames([book({ series: "Duna" }), book({ series: "duna" }), book({ series: "Duna" }), book({ series: "" })])).toEqual(["Duna"]);
  });
});
