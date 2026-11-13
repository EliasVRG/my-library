import { describe, expect, it } from "vitest";
import { emptyBookData, type Book } from "../../shared/model";
import { finishedIn, goalPace, statYears, yearStats } from "../../src/lib/stats";
import { yearLine } from "../../src/lib/story/data";

let seq = 0;
function book(over: Partial<Book> = {}): Book {
  return { ...emptyBookData(), id: `b${++seq}`, title: `Livro ${seq}`, pdf_ready_key: null, created_at: 1, updated_at: 1, field_clock: {}, rev: 0, ...over } as Book;
}
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

describe("yearStats", () => {
  const books = [
    book({ title: "Março", category: "Romance", pages: 200, status: "lido", started_at: at(2026, 3, 1), finished_at: at(2026, 3, 10) }),
    book({ title: "Janeiro", category: "Ensaio", pages: 100, status: "lido", started_at: at(2026, 1, 1), finished_at: at(2026, 1, 20) }),
    book({ title: "Março 2", category: "Romance", pages: 0, status: "lido", finished_at: at(2026, 3, 25) }),
    book({ title: "Ano passado", status: "lido", finished_at: at(2025, 12, 31) }),
    book({ title: "Excluído", status: "lido", finished_at: at(2026, 5, 1), deleted_at: 9 }),
    book({ title: "Sem data", status: "lido" }),
    book({ title: "Lendo", status: "lendo", started_at: at(2026, 4, 1) }),
  ];
  it("conta livros, páginas, meses e categorias do ano", () => {
    const s = yearStats(books, 2026);
    expect(s.books.map((b) => b.title)).toEqual(["Janeiro", "Março", "Março 2"]);
    expect(s.count).toBe(3);
    expect(s.pages).toBe(300);
    expect(s.byMonth.slice(0, 4)).toEqual([1, 0, 2, 0]);
    expect(s.categories).toEqual([["Romance", 2], ["Ensaio", 1]]);
    // Média só entre os que têm início e fim: 20 e 10 dias.
    expect(s.avgDays).toBe(15);
    expect(s.undated).toBe(1);
  });
  it("lista os anos com leitura e o atual, do mais recente", () => {
    expect(statYears(books, at(2027, 2, 1))).toEqual([2027, 2026, 2025]);
    expect(finishedIn(books, 2024)).toEqual([]);
  });
});

describe("goalPace", () => {
  it("compara com o esperado até hoje", () => {
    // 1º de julho: metade do ano, meta de 12 → 5 esperados (arredonda para baixo).
    const mid = at(2026, 7, 1);
    expect(goalPace(8, 12, 2026, mid)).toMatchObject({ state: "adiantado", diff: 3 });
    expect(goalPace(5, 12, 2026, mid)).toMatchObject({ state: "no ritmo", diff: 0 });
    const behind = goalPace(2, 12, 2026, mid);
    expect(behind.state).toBe("atrasado");
    // Faltam 10 em 6 meses (jul a dez).
    expect(behind.perMonthLeft).toBe(1.7);
    expect(goalPace(12, 12, 2026, mid).state).toBe("batida");
  });
  it("ano que já passou: batida ou encerrado", () => {
    expect(goalPace(9, 12, 2025, at(2026, 2, 1))).toMatchObject({ state: "encerrado", perMonthLeft: null });
    expect(goalPace(13, 12, 2025, at(2026, 2, 1)).state).toBe("batida");
  });
});

describe("linha do ano no story com meta", () => {
  const a = book({ finished_at: at(2026, 1, 5) });
  const b = book({ finished_at: at(2026, 2, 5) });
  const all = [a, b];
  it("usa a meta do ano quando existe", () => {
    expect(yearLine(b, all, () => 12)).toBe("Livro 2 de 12 da meta de 2026");
    expect(yearLine(b, all, () => 1)).toBe("2º livro lido em 2026, meta batida");
    expect(yearLine(b, all, () => null)).toBe("2º livro lido em 2026");
    expect(yearLine(b, all)).toBe("2º livro lido em 2026");
  });
});
