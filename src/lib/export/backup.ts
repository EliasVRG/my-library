// Exportar (zip com resenhas em Markdown + estante.json, PDFs opcionais) e importar.

import { strToU8, unzipSync, strFromU8, zipSync, type Zippable } from "fflate";
import {
  BOOK_FIELDS,
  REVIEW_FIELDS,
  REVIEW_LABEL,
  STATUS_LABEL,
  type Book,
  type Change,
  type Clock,
  type Review,
} from "../../../shared/model";
import { parseChange } from "../../../shared/validate";

export interface ExportData {
  app: "estante-de-leitura";
  version: 1;
  exported_at: string;
  books: Book[];
  reviews: Review[];
}

export function buildExportData(books: Book[], reviews: Review[], now = new Date()): ExportData {
  const live = books.filter((b) => b.deleted_at == null);
  const ids = new Set(live.map((b) => b.id));
  return {
    app: "estante-de-leitura",
    version: 1,
    exported_at: now.toISOString(),
    books: live,
    reviews: reviews.filter((r) => ids.has(r.book_id)),
  };
}

export function slugify(s: string): string {
  const slug = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "livro";
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const yaml = (s: string) => JSON.stringify(s); // string JSON é YAML válido

export function bookToMarkdown(book: Book, review?: Review): string {
  const fm = [
    "---",
    `titulo: ${yaml(book.title)}`,
    `autor: ${yaml(book.author)}`,
    `categoria: ${yaml(book.category)}`,
    `situacao: ${yaml(STATUS_LABEL[book.status] ?? book.status)}`,
    `nota: ${book.rating || "null"}`,
    `paginas: ${book.pages || "null"}`,
    `pagina_atual: ${book.current_page}`,
    `criado_em: ${isoDate(book.created_at)}`,
    `atualizado_em: ${isoDate(Math.max(book.updated_at, review?.updated_at ?? 0))}`,
    ...(book.file_name ? [`arquivo_pdf: ${yaml(book.file_name)}`] : []),
    `id: ${book.id}`,
    "---",
    "",
  ];
  const body = [`# ${book.title}`, ""];
  if (book.author) body.push(`*${book.author}*`, "");
  if (book.rating) body.push(`Nota: ${"★".repeat(book.rating)}${"☆".repeat(5 - book.rating)}`, "");
  for (const f of REVIEW_FIELDS) {
    const text = review?.[f]?.trim();
    body.push(`## ${REVIEW_LABEL[f]}`, "", text || "_(em branco)_", "");
  }
  return fm.join("\n") + body.join("\n");
}

export interface PdfForExport {
  book: Book;
  data: Uint8Array;
}

export function buildZip(data: ExportData, pdfs: PdfForExport[] = []): Uint8Array {
  const files: Zippable = {};
  const used = new Set<string>();
  const unique = (base: string, ext: string) => {
    let name = `${base}${ext}`;
    for (let i = 2; used.has(name); i++) name = `${base}-${i}${ext}`;
    used.add(name);
    return name;
  };
  const reviews = new Map(data.reviews.map((r) => [r.book_id, r]));
  const slugs = new Map<string, string>();
  for (const b of [...data.books].sort((a, z) => a.title.localeCompare(z.title, "pt"))) {
    const name = unique(`resenhas/${slugify(b.title)}`, ".md");
    slugs.set(b.id, name.slice("resenhas/".length, -3));
    files[name] = strToU8(bookToMarkdown(b, reviews.get(b.id)));
  }
  files["estante.json"] = strToU8(JSON.stringify(data, null, 2));
  for (const p of pdfs) {
    // PDFs já são comprimidos; nível 0 evita gastar CPU à toa.
    files[unique(`pdfs/${slugs.get(p.book.id) ?? slugify(p.book.title)}`, ".pdf")] = [p.data, { level: 0 }];
  }
  return zipSync(files, { level: 6 });
}

export class ImportError extends Error {}

/** Lê um estante.json (ou um zip exportado que contenha um) e devolve alterações validadas. */
export function parseImport(bytes: Uint8Array): Change[] {
  let text: string;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = unzipSync(bytes, { filter: (f) => f.name === "estante.json" });
    if (!entries["estante.json"]) throw new ImportError("Este zip não tem um estante.json.");
    text = strFromU8(entries["estante.json"]);
  } else {
    text = strFromU8(bytes);
  }
  let data: Partial<ExportData>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("O arquivo não é um JSON válido.");
  }
  if (data?.app !== "estante-de-leitura" || !Array.isArray(data.books) || !Array.isArray(data.reviews)) {
    throw new ImportError("Este arquivo não parece um backup da Estante.");
  }
  const now = Date.now();
  const changes: Change[] = [];
  const toChange = (table: "books" | "reviews", id: string, rec: Record<string, unknown>, fields: readonly string[], createdAt?: number) => {
    const fc = (rec.field_clock ?? {}) as Record<string, Clock>;
    const fallback: Clock = [typeof rec.updated_at === "number" ? rec.updated_at : 1, "import"];
    const out: Record<string, unknown> = {};
    const clock: Record<string, Clock> = {};
    for (const f of fields) {
      if (!(f in rec) || f === "deleted_at") continue;
      out[f] = rec[f];
      clock[f] = fc[f] ?? fallback;
    }
    const parsed = parseChange({ table, id, fields: out, clock, created_at: createdAt }, now);
    if (typeof parsed === "string") throw new ImportError(`Registro ${id}: ${parsed}`);
    changes.push(parsed);
  };
  for (const b of data.books as unknown as Record<string, unknown>[]) {
    if (b.deleted_at != null) continue;
    toChange("books", String(b.id), b, BOOK_FIELDS, typeof b.created_at === "number" ? b.created_at : undefined);
  }
  for (const r of data.reviews as unknown as Record<string, unknown>[]) {
    toChange("reviews", String(r.book_id), r, REVIEW_FIELDS);
  }
  return changes;
}
