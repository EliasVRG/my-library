// O que cada story mostra, a partir do livro, da resenha e da estante reais.
// Nada aqui inventa texto: campo vazio vira `null` e o modelo esconde o bloco.

import { type Book, type Review, type ReviewField } from "../../../shared/model";
import { accentFor } from "./palette";
import { normalize } from "./text";

/** Rótulos dos campos no seletor de trecho (os mesmos do painel de resenha). */
export const HIGHLIGHT_LABEL: Record<ReviewField, string> = {
  resumo: "Resumo",
  argumentos: "Argumentos do autor",
  concordo: "Onde concordo",
  discordo: "Onde discordo",
  outro_lado: "Como o outro lado responderia",
  notas: "Notas e citações",
};

export const HIGHLIGHT_MAX = 220;

/** Limita o trecho a HIGHLIGHT_MAX caracteres, cortando no fim de uma palavra e marcando com reticências. */
export function clipHighlight(text: string): string {
  const chars = [...text];
  if (chars.length <= HIGHLIGHT_MAX) return text;
  const head = chars.slice(0, HIGHLIGHT_MAX - 1).join("");
  const cut = head.lastIndexOf(" ");
  return (cut > HIGHLIGHT_MAX / 2 ? head.slice(0, cut) : head).replace(/[\s,.;:—–-]+$/, "") + "…";
}

export interface StoryData {
  title: string;
  author: string;
  category: string;
  accent: string;
  /** 0 = sem nota (esconde as estrelas). */
  rating: number;
  pages: number | null;
  days: number | null;
  /** Campos preenchidos da resenha, na ordem do painel: opções do trecho em destaque. */
  highlightOptions: { field: ReviewField; label: string; text: string }[];
  /** Trecho escolhido para o modelo 1 (já limitado a HIGHLIGHT_MAX). */
  highlight: string | null;
  concordo: string | null;
  discordo: string | null;
  outroLado: string | null;
  /** "3º livro lido em 2026". */
  yearLine: string | null;
  /** Título do "Quero ler" adicionado mais recentemente. */
  next: string | null;
  /** "@usuario" ou null. */
  handle: string | null;
}

const DAY = 24 * 60 * 60 * 1000;
const dayNumber = (ms: number) => {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};

/** Dias de leitura contando o primeiro e o último (começou e terminou no mesmo dia = 1). */
export function readingDays(book: Pick<Book, "started_at" | "finished_at">): number | null {
  const { started_at: s, finished_at: f } = book;
  if (!s || !f || f < s) return null;
  return dayNumber(f) - dayNumber(s) + 1;
}

/** Posição do livro entre os terminados no mesmo ano: "3º livro lido em 2026". */
export function yearLine(book: Book, books: Book[]): string | null {
  if (!book.finished_at) return null;
  const year = new Date(book.finished_at).getFullYear();
  const n = books.filter(
    (b) =>
      b.deleted_at == null &&
      b.finished_at &&
      new Date(b.finished_at).getFullYear() === year &&
      (b.finished_at < book.finished_at! || b.id === book.id),
  ).length;
  return `${n}º livro lido em ${year}`;
}

export function nextReading(book: Book, books: Book[]): string | null {
  const queue = books.filter((b) => b.id !== book.id && b.deleted_at == null && b.status === "quero");
  queue.sort((a, b) => b.created_at - a.created_at);
  return queue[0]?.title ?? null;
}

export function normalizeHandle(raw: string | null | undefined): string | null {
  const h = (raw ?? "").trim().replace(/^@+/, "").replace(/\s+/g, "");
  return h ? `@${h}` : null;
}

const filled = (s: string | undefined | null) => {
  const t = normalize(s ?? "");
  return t ? t : null;
};

export function buildStoryData(
  book: Book,
  review: Review | undefined,
  books: Book[],
  opts: { handle?: string | null; highlight?: string | null } = {},
): StoryData {
  const options = (Object.keys(HIGHLIGHT_LABEL) as ReviewField[])
    .map((field) => ({ field, label: HIGHLIGHT_LABEL[field], text: filled(review?.[field]) }))
    .filter((o): o is { field: ReviewField; label: string; text: string } => o.text != null);
  const chosen = opts.highlight !== undefined ? filled(opts.highlight) : (options[0]?.text ?? null);
  return {
    title: book.title.trim() || "Sem título",
    author: book.author.trim(),
    category: book.category.trim(),
    accent: accentFor(book.category),
    rating: Math.max(0, Math.min(5, book.rating || 0)),
    pages: book.pages > 0 ? book.pages : null,
    days: readingDays(book),
    highlightOptions: options,
    highlight: chosen ? clipHighlight(chosen) : null,
    concordo: filled(review?.concordo),
    discordo: filled(review?.discordo),
    outroLado: filled(review?.outro_lado),
    yearLine: yearLine(book, books),
    next: nextReading(book, books),
    handle: normalizeHandle(opts.handle),
  };
}

/** O modelo 2 precisa de pelo menos um dos três campos. */
export function hasDebate(d: StoryData): boolean {
  return !!(d.concordo || d.discordo || d.outroLado);
}

export const STORY_MODEL_NAME = { destaque: "Nota e destaque", concordo: "Concordo e discordo", terminei: "Terminei de ler" } as const;

/** Texto alternativo da prévia: o que a imagem mostra, com os mesmos dados. */
export function storyAlt(model: keyof typeof STORY_MODEL_NAME, d: StoryData): string {
  const parts = [`Story “${STORY_MODEL_NAME[model]}” de ${d.title}${d.author ? `, de ${d.author}` : ""}`];
  if (d.rating) parts.push(`nota ${d.rating} de 5`);
  if (model === "destaque" && d.highlight) parts.push(`trecho: “${d.highlight}”`);
  if (model === "concordo") {
    if (d.concordo) parts.push(`onde concordo: “${d.concordo}”`);
    if (d.discordo) parts.push(`onde discordo: “${d.discordo}”`);
    if (d.outroLado) parts.push(`o outro lado diria: “${d.outroLado}”`);
  }
  if (model !== "concordo") {
    if (d.pages) parts.push(`${d.pages} páginas`);
    if (d.days) parts.push(`${d.days} ${d.days === 1 ? "dia" : "dias"} de leitura`);
  }
  if (model === "terminei") {
    if (d.yearLine) parts.push(d.yearLine);
    if (d.next) parts.push(`próxima leitura: ${d.next}`);
  }
  if (d.handle) parts.push(d.handle);
  return parts.join("; ") + ".";
}
