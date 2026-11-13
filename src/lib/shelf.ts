// Organização da estante: coleções viram uma pilha só, categorias mais usadas primeiro.
// Puro (sem Svelte nem IndexedDB) para os testes.

import type { Book, Status } from "../../shared/model";

export const NO_CATEGORY = "Sem categoria";
const STATUS_ORDER: Record<Status, number> = { lendo: 0, pausado: 1, quero: 2, lido: 3 };

/** Chave de comparação: "Harry Potter", " harry potter " e "HARRY POTTER" são a mesma coleção. */
export const seriesKey = (name: string | undefined | null): string => (name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt");

export interface SeriesEntry {
  kind: "series";
  key: string;
  /** Nome como aparece na maioria dos volumes. */
  name: string;
  /** Volumes em ordem (sem número no fim, por título). */
  books: Book[];
  read: number;
  /** Autor comum a todos, ou vazio. */
  author: string;
  category: string;
}
export type ShelfEntry = { kind: "book"; book: Book } | SeriesEntry;

/** Ordem dos volumes: número da coleção; sem número vai para o fim, por título. */
export function byVolume(a: Book, b: Book): number {
  const ia = a.series_index ?? Infinity;
  const ib = b.series_index ?? Infinity;
  if (ia !== ib) return ia < ib ? -1 : 1;
  return a.title.localeCompare(b.title, "pt");
}

const byShelf = (a: Book, b: Book) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || b.updated_at - a.updated_at;

function mostCommon(values: string[]): string {
  const n = new Map<string, number>();
  for (const v of values) if (v) n.set(v, (n.get(v) ?? 0) + 1);
  let best = "";
  let max = 0;
  for (const [v, c] of n) if (c > max) [best, max] = [v, c];
  return best;
}

export function makeSeries(key: string, books: Book[]): SeriesEntry {
  const sorted = [...books].sort(byVolume);
  const authors = new Set(sorted.map((b) => b.author.trim()).filter(Boolean));
  return {
    kind: "series",
    key,
    name: mostCommon(sorted.map((b) => (b.series ?? "").trim())) || sorted[0]?.series?.trim() || "",
    books: sorted,
    read: sorted.filter((b) => b.status === "lido").length,
    author: authors.size === 1 ? [...authors][0] : "",
    category: mostCommon(sorted.map((b) => b.category)),
  };
}

/**
 * Entradas da grade: livros avulsos e uma pilha por coleção. A pilha ocupa o lugar do volume
 * "mais à frente" (lendo antes de pausado, antes de quero ler, antes de lido; o mais recente).
 * Coleção com um volume só continua como livro, para não esconder nada atrás de um clique.
 */
export function shelfEntries(books: Book[]): ShelfEntry[] {
  const sorted = [...books].sort(byShelf);
  const groups = new Map<string, Book[]>();
  for (const b of sorted) {
    const k = seriesKey(b.series);
    if (k) groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const out: ShelfEntry[] = [];
  const placed = new Set<string>();
  for (const b of sorted) {
    const k = seriesKey(b.series);
    const group = k ? groups.get(k)! : null;
    if (!group || group.length < 2) out.push({ kind: "book", book: b });
    else if (!placed.has(k)) {
      placed.add(k);
      out.push(makeSeries(k, group));
    }
  }
  return out;
}

/** Categorias com contagem, das mais usadas para as menos (empate: ordem alfabética). */
export function categoryCounts(books: Book[]): [string, number][] {
  const m = new Map<string, number>();
  for (const b of books) {
    const c = b.category.trim() || NO_CATEGORY;
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt"));
}

/** Nomes de coleção já usados (para sugerir ao digitar), cada um uma vez. */
export function seriesNames(books: Book[]): string[] {
  const groups = new Map<string, Book[]>();
  for (const b of books) {
    const k = seriesKey(b.series);
    if (k) groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  return [...groups].map(([k, g]) => makeSeries(k, g).name).sort((a, b) => a.localeCompare(b, "pt"));
}

/** Próximo número livre numa coleção (para sugerir o volume de um livro novo). */
export function nextVolume(books: Book[], series: string): number | null {
  const k = seriesKey(series);
  if (!k) return null;
  const nums = books.filter((b) => seriesKey(b.series) === k && b.series_index != null).map((b) => b.series_index!);
  return nums.length ? Math.floor(Math.max(...nums)) + 1 : 1;
}

/** "Vol. 2", "Vol. 2.5"; vazio sem número. */
export const volumeLabel = (n: number | null | undefined): string => (n == null ? "" : `Vol. ${String(n).replace(".", ",")}`);

/** Lê o volume digitado ("2", "2,5", "2.5"); vazio ou inválido = sem número. */
export function parseVolume(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 10_000 ? n : null;
}
