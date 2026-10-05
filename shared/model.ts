// Tipos e regras de dados usados igualmente pelo front e pelo Worker.

export type Status = "quero" | "lendo" | "pausado" | "lido";
export const STATUSES: readonly Status[] = ["quero", "lendo", "pausado", "lido"];
export const STATUS_LABEL: Record<Status, string> = {
  quero: "Quero ler",
  lendo: "Lendo",
  pausado: "Pausado",
  lido: "Lido",
};

/** [timestamp em ms, deviceId]. Compara pelo tempo e desempata pelo aparelho. */
export type Clock = [number, string];
export type FieldClock = Record<string, Clock>;

export const BOOK_FIELDS = [
  "title",
  "author",
  "category",
  "status",
  "rating",
  "pdf_key",
  "file_name",
  "pdf_size",
  "pages",
  "current_page",
  "deleted_at",
] as const;
export type BookField = (typeof BOOK_FIELDS)[number];

export const REVIEW_FIELDS = ["resumo", "argumentos", "concordo", "discordo", "outro_lado", "notas"] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];

export const REVIEW_LABEL: Record<ReviewField, string> = {
  resumo: "Resumo em poucas linhas",
  argumentos: "Argumentos principais do autor",
  concordo: "Onde eu concordo",
  discordo: "Onde eu discordo",
  outro_lado: "Como o outro lado responderia",
  notas: "Anotações livres e citações",
};

export interface BookData {
  title: string;
  author: string;
  category: string;
  status: Status;
  rating: number;
  pdf_key: string | null;
  file_name: string;
  pdf_size: number;
  pages: number;
  current_page: number;
  deleted_at: number | null;
}

export interface Book extends BookData {
  id: string;
  /** Chave do PDF que o servidor confirmou estar completo no R2. Só o servidor escreve. */
  pdf_ready_key: string | null;
  created_at: number;
  updated_at: number;
  field_clock: FieldClock;
  rev: number;
}

export type ReviewData = Record<ReviewField, string>;

export interface Review extends ReviewData {
  book_id: string;
  field_clock: FieldClock;
  updated_at: number;
  rev: number;
}

export type Table = "books" | "reviews";

/** Uma alteração enviada ao servidor: só os campos alterados, cada um com seu relógio. */
export interface Change {
  table: Table;
  id: string;
  fields: Record<string, unknown>;
  clock: FieldClock;
  created_at?: number;
}

export interface ChangesResponse {
  books: Book[];
  reviews: Review[];
  cursor: number;
  more: boolean;
}

export const PLAN: [string, string, string][] = [
  ["A Mente Moralista", "Jonathan Haidt", "Mente e vieses"],
  ["Rápido e Devagar", "Daniel Kahneman", "Mente e vieses"],
  ["The Scout Mindset", "Julia Galef", "Mente e vieses"],
  ["Superprevisões", "Philip Tetlock", "Mente e vieses"],
  ["Presidencialismo de Coalizão", "Sérgio Abranches", "Sistema político"],
  ["Sistemas Eleitorais", "Jairo Nicolau", "Sistema político"],
  ["Economia: Modo de Usar", "Ha-Joon Chang", "Economia"],
  ["Economia Básica", "Thomas Sowell", "Economia"],
  ["Economia Brasileira Contemporânea", "Fabio Giambiagi e outros", "Economia"],
  ["Ideologias Políticas", "Andrew Heywood", "Ideologias"],
  ["Direita e Esquerda", "Norberto Bobbio", "Ideologias"],
  ["O Caminho da Servidão", "Friedrich Hayek", "Ideologias"],
];

export const PART_SIZE = 10 * 1024 * 1024;

export function emptyBookData(): BookData {
  return {
    title: "",
    author: "",
    category: "",
    status: "quero",
    rating: 0,
    pdf_key: null,
    file_name: "",
    pdf_size: 0,
    pages: 0,
    current_page: 1,
    deleted_at: null,
  };
}

export function emptyReviewData(): ReviewData {
  return { resumo: "", argumentos: "", concordo: "", discordo: "", outro_lado: "", notas: "" };
}

export function pdfKeyFor(bookId: string, fileId: string): string {
  return `pdfs/${bookId}/${fileId}.pdf`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID.test(s);
}

export function isPdfKeyFor(bookId: string, key: unknown): key is string {
  if (typeof key !== "string") return false;
  const m = /^pdfs\/([^/]+)\/([^/]+)\.pdf$/.exec(key);
  return !!m && m[1] === bookId && isUuid(m[2]);
}

export type PdfState = "none" | "uploading" | "ready";
export function pdfState(b: Pick<Book, "pdf_key" | "pdf_ready_key">): PdfState {
  if (!b.pdf_key) return "none";
  return b.pdf_ready_key === b.pdf_key ? "ready" : "uploading";
}

export function hasReview(r: Partial<ReviewData> | undefined | null): boolean {
  return !!r && REVIEW_FIELDS.some((f) => (r[f] ?? "").trim() !== "");
}
