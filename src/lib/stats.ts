// Estatísticas de leitura por ano, a partir das datas `started_at`/`finished_at`. Puro, para os testes.

import type { Book } from "../../shared/model";
import { readingDays } from "./story/data";
import { NO_CATEGORY } from "./shelf";

export const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

const yearOf = (ms: number) => new Date(ms).getFullYear();

/** Livros terminados no ano, do primeiro ao último. */
export function finishedIn(books: Book[], year: number): Book[] {
  return books
    .filter((b) => b.deleted_at == null && b.finished_at && yearOf(b.finished_at) === year)
    .sort((a, b) => a.finished_at! - b.finished_at!);
}

/** Anos com algum livro terminado, mais o ano atual, do mais recente ao mais antigo. */
export function statYears(books: Book[], now: number): number[] {
  const years = new Set([yearOf(now)]);
  for (const b of books) if (b.deleted_at == null && b.finished_at) years.add(yearOf(b.finished_at));
  return [...years].sort((a, b) => b - a);
}

export interface YearStats {
  year: number;
  books: Book[];
  count: number;
  /** Soma das páginas dos livros terminados (livros sem número de páginas não entram). */
  pages: number;
  /** Média de dias de leitura, entre os que têm início e fim; null se nenhum tem. */
  avgDays: number | null;
  byMonth: number[];
  /** Categorias dos livros lidos, da mais lida para a menos. */
  categories: [string, number][];
  /** Marcados como "Lido" sem data de término: não entram em nenhum ano. */
  undated: number;
}

export function yearStats(books: Book[], year: number): YearStats {
  const done = finishedIn(books, year);
  const byMonth = Array.from({ length: 12 }, () => 0);
  const cats = new Map<string, number>();
  const days: number[] = [];
  let pages = 0;
  for (const b of done) {
    byMonth[new Date(b.finished_at!).getMonth()]++;
    const c = b.category.trim() || NO_CATEGORY;
    cats.set(c, (cats.get(c) ?? 0) + 1);
    pages += b.pages > 0 ? b.pages : 0;
    const d = readingDays(b);
    if (d != null) days.push(d);
  }
  return {
    year,
    books: done,
    count: done.length,
    pages,
    avgDays: days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null,
    byMonth,
    categories: [...cats].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt")),
    undated: books.filter((b) => b.deleted_at == null && b.status === "lido" && !b.finished_at).length,
  };
}

export interface Pace {
  /** Fração da meta cumprida (0…1+). */
  done: number;
  /** Quantos já deveriam estar lidos hoje para fechar a meta no ritmo. */
  expected: number;
  /** Positivo = adiantado, negativo = atrasado (em livros). */
  diff: number;
  state: "batida" | "adiantado" | "no ritmo" | "atrasado" | "encerrado";
  /** Livros por mês necessários daqui até o fim do ano (só no ano atual). */
  perMonthLeft: number | null;
}

/** Ritmo da meta: compara o lido com o esperado até hoje (proporcional aos dias do ano). */
export function goalPace(count: number, goal: number, year: number, now: number): Pace {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const frac = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const expected = Math.floor(goal * frac);
  const diff = count - expected;
  const done = goal > 0 ? count / goal : 0;
  const current = now >= start && now < end;
  const monthsLeft = current ? 12 - new Date(now).getMonth() : 0;
  let state: Pace["state"];
  if (count >= goal) state = "batida";
  else if (!current && now >= end) state = "encerrado";
  else if (diff > 0) state = "adiantado";
  else if (diff === 0) state = "no ritmo";
  else state = "atrasado";
  return {
    done,
    expected,
    diff,
    state,
    perMonthLeft: current && count < goal ? Math.ceil(((goal - count) / monthsLeft) * 10) / 10 : null,
  };
}
