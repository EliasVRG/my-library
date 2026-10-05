import { describe, expect, it } from "vitest";
import { applyRemote, compareClock, mergeBook, mergeReview } from "../../shared/merge";
import { emptyBookData, emptyReviewData, type Book, type Review } from "../../shared/model";
import { MAX_CLOCK_SKEW, parseChange } from "../../shared/validate";

const ID = "11111111-1111-4111-8111-111111111111";

function book(over: Partial<Book> = {}): Book {
  return {
    ...emptyBookData(),
    id: ID,
    title: "Original",
    pdf_ready_key: null,
    created_at: 1,
    updated_at: 1,
    field_clock: { title: [100, "a"], current_page: [100, "a"], status: [100, "a"] },
    rev: 1,
    ...over,
  };
}

function review(over: Partial<Review> = {}): Review {
  return { ...emptyReviewData(), book_id: ID, field_clock: {}, updated_at: 1, rev: 1, ...over };
}

describe("compareClock", () => {
  it("ordena pelo tempo e desempata pelo aparelho", () => {
    expect(compareClock([1, "a"], [2, "a"])).toBe(-1);
    expect(compareClock([2, "a"], [1, "z"])).toBe(1);
    expect(compareClock([5, "a"], [5, "b"])).toBe(-1);
    expect(compareClock([5, "b"], [5, "b"])).toBe(0);
    expect(compareClock(undefined, [1, "a"])).toBe(-1);
  });
});

describe("mergeBook: conflito por campo", () => {
  it("edições em campos diferentes em aparelhos diferentes não se sobrescrevem", () => {
    // celular muda o título em t=200; computador avança a página em t=150
    let b = book();
    b = mergeBook(b, { title: "Novo título" }, { title: [200, "celular"] }).merged;
    b = mergeBook(b, { current_page: 42 }, { current_page: [150, "computador"] }).merged;
    expect(b.title).toBe("Novo título");
    expect(b.current_page).toBe(42);
  });

  it("no mesmo campo, vence a escrita mais recente, independente da ordem de chegada", () => {
    const base = book();
    const a = { fields: { current_page: 10 }, clock: { current_page: [300, "a"] as [number, string] } };
    const c = { fields: { current_page: 20 }, clock: { current_page: [200, "c"] as [number, string] } };
    const ac = mergeBook(mergeBook(base, a.fields, a.clock).merged, c.fields, c.clock).merged;
    const ca = mergeBook(mergeBook(base, c.fields, c.clock).merged, a.fields, a.clock).merged;
    expect(ac.current_page).toBe(10);
    expect(ca.current_page).toBe(10);
  });

  it("ignora escrita com relógio mais antigo e reporta o que mudou", () => {
    const r = mergeBook(book(), { title: "Velho", author: "X" }, { title: [50, "b"], author: [50, "b"] });
    expect(r.merged.title).toBe("Original");
    expect(r.merged.author).toBe("X");
    expect(r.changed).toEqual(["author"]);
  });

  it("aplicar a mesma alteração duas vezes não muda nada (idempotente)", () => {
    const once = mergeBook(book(), { title: "T" }, { title: [500, "a"] }).merged;
    const twice = mergeBook(once, { title: "T" }, { title: [500, "a"] });
    expect(twice.changed).toEqual([]);
  });
});

describe("mergeBook: exclusão", () => {
  it("exclusão vence edições mais novas", () => {
    const r = mergeBook(book(), { deleted_at: 120, title: "Editado depois" }, { deleted_at: [120, "a"], title: [900, "b"] });
    expect(r.merged.deleted_at).toBe(120);
    expect(r.merged.title).toBe("Original");
  });

  it("livro excluído não volta", () => {
    const deleted = book({ deleted_at: 120 });
    const r = mergeBook(deleted, { title: "Ressuscitar", deleted_at: null }, { title: [999, "b"], deleted_at: [999, "b"] });
    expect(r.changed).toEqual([]);
    expect(r.merged.deleted_at).toBe(120);
  });
});

describe("mergeReview", () => {
  it("campos da resenha são independentes", () => {
    let r = review();
    r = mergeReview(r, { resumo: "do celular" }, { resumo: [10, "celular"] }).merged;
    r = mergeReview(r, { notas: "do computador" }, { notas: [5, "pc"] }).merged;
    expect(r.resumo).toBe("do celular");
    expect(r.notas).toBe("do computador");
  });
});

describe("applyRemote", () => {
  it("aceita o servidor nos campos sem pendência e preserva os pendentes", () => {
    const local = book({ title: "Local pendente", current_page: 3, field_clock: { title: [900, "eu"], current_page: [10, "eu"] } });
    const remote = book({ title: "Do servidor", current_page: 50, rev: 9, field_clock: { title: [800, "x"], current_page: [20, "x"] } });
    const out = applyRemote(local, remote, ["title"]);
    expect(out.title).toBe("Local pendente");
    expect(out.field_clock.title).toEqual([900, "eu"]);
    expect(out.current_page).toBe(50);
    expect(out.rev).toBe(9);
  });

  it("converge para o servidor mesmo se o relógio local estiver adiantado", () => {
    const local = book({ title: "A", field_clock: { title: [9_999_999, "adiantado"] } });
    const remote = book({ title: "B", field_clock: { title: [100, "x"] } });
    expect(applyRemote(local, remote, []).title).toBe("B");
  });

  it("não protege deleted_at pendente contra a exclusão do servidor", () => {
    const local = book();
    const remote = book({ deleted_at: 5 });
    expect(applyRemote(local, remote, ["deleted_at"]).deleted_at).toBe(5);
  });
});

describe("parseChange", () => {
  const now = 1_000_000;
  it("aceita uma alteração válida", () => {
    const c = parseChange({ table: "books", id: ID, fields: { status: "lendo" }, clock: { status: [now, "a"] } }, now);
    expect(typeof c).toBe("object");
  });
  it.each([
    [{ table: "x", id: ID, fields: {}, clock: {} }, "tabela"],
    [{ table: "books", id: "nao-uuid", fields: {}, clock: {} }, "id"],
    [{ table: "books", id: ID, fields: { hack: 1 }, clock: { hack: [1, "a"] } }, "desconhecido"],
    [{ table: "books", id: ID, fields: { status: "talvez" }, clock: { status: [1, "a"] } }, "status"],
    [{ table: "books", id: ID, fields: { rating: 6 }, clock: { rating: [1, "a"] } }, "rating"],
    [{ table: "books", id: ID, fields: { title: "x" }, clock: {} }, "relógio"],
    [{ table: "books", id: ID, fields: { pdf_key: "pdfs/outro/abc.pdf" }, clock: { pdf_key: [1, "a"] } }, "pdf_key"],
  ])("rejeita %j", (raw, msg) => {
    const c = parseChange(raw, now);
    expect(typeof c).toBe("string");
    expect(c).toContain(msg);
  });
  it("limita relógios no futuro", () => {
    const c = parseChange({ table: "books", id: ID, fields: { title: "x" }, clock: { title: [now * 10, "a"] } }, now);
    expect(typeof c !== "string" && c.clock.title[0]).toBe(now + MAX_CLOCK_SKEW);
  });
});
