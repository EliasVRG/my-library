// Acesso ao D1: leitura e escrita de livros/resenhas com revisão do servidor.

import { BOOK_FIELDS, REVIEW_FIELDS, emptyBookData, emptyReviewData, type Book, type Review } from "../shared/model";

type Row = Record<string, unknown>;

export function rowToBook(r: Row): Book {
  return {
    id: r.id as string,
    title: r.title as string,
    author: r.author as string,
    category: r.category as string,
    status: r.status as Book["status"],
    rating: r.rating as number,
    pdf_key: (r.pdf_key as string | null) ?? null,
    file_name: r.file_name as string,
    pdf_size: r.pdf_size as number,
    pdf_ready_key: (r.pdf_ready_key as string | null) ?? null,
    pages: r.pages as number,
    current_page: r.current_page as number,
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
    deleted_at: (r.deleted_at as number | null) ?? null,
    field_clock: JSON.parse((r.field_clock as string) || "{}"),
    rev: r.rev as number,
  };
}

export function rowToReview(r: Row): Review {
  const out = { ...emptyReviewData() } as Review;
  for (const f of REVIEW_FIELDS) out[f] = (r[f] as string) ?? "";
  out.book_id = r.book_id as string;
  out.field_clock = JSON.parse((r.field_clock as string) || "{}");
  out.updated_at = r.updated_at as number;
  out.rev = r.rev as number;
  return out;
}

export function newBook(id: string, createdAt: number): Book {
  return {
    ...emptyBookData(),
    id,
    pdf_ready_key: null,
    created_at: createdAt,
    updated_at: createdAt,
    field_clock: {},
    rev: 0,
  };
}

export function newReview(bookId: string, now: number): Review {
  return { ...emptyReviewData(), book_id: bookId, field_clock: {}, updated_at: now, rev: 0 };
}

const CHUNK = 90; // D1 aceita até 100 parâmetros por query

async function selectByIds(db: D1Database, table: "books" | "reviews", ids: string[]): Promise<Row[]> {
  const key = table === "books" ? "id" : "book_id";
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const q = `SELECT * FROM ${table} WHERE ${key} IN (${part.map(() => "?").join(",")})`;
    const res = await db.prepare(q).bind(...part).all<Row>();
    rows.push(...res.results);
  }
  return rows;
}

export async function loadBooks(db: D1Database, ids: string[]): Promise<Map<string, Book>> {
  if (!ids.length) return new Map();
  return new Map((await selectByIds(db, "books", ids)).map((r) => [r.id as string, rowToBook(r)]));
}

export async function loadReviews(db: D1Database, ids: string[]): Promise<Map<string, Review>> {
  if (!ids.length) return new Map();
  return new Map((await selectByIds(db, "reviews", ids)).map((r) => [r.book_id as string, rowToReview(r)]));
}

export async function getBook(db: D1Database, id: string): Promise<Book | null> {
  const r = await db.prepare("SELECT * FROM books WHERE id = ?").bind(id).first<Row>();
  return r ? rowToBook(r) : null;
}

const BOOK_COLS = [...BOOK_FIELDS, "pdf_ready_key", "created_at", "updated_at", "field_clock"] as const;
const REVIEW_COLS = [...REVIEW_FIELDS, "field_clock", "updated_at"] as const;

/**
 * Upsert condicional (compare-and-swap): só grava se o `rev` no banco ainda é o que lemos.
 * `revExpr` é a expressão SQL que dá o novo rev. Se `meta.changes` vier 0, houve corrida.
 */
export function upsertBookStmt(db: D1Database, b: Book, expectedRev: number, revExpr: string): D1PreparedStatement {
  const values = BOOK_COLS.map((c) => (c === "field_clock" ? JSON.stringify(b.field_clock) : (b as unknown as Row)[c]));
  const sql =
    `INSERT INTO books (id, ${BOOK_COLS.join(", ")}, rev) VALUES (?, ${BOOK_COLS.map(() => "?").join(", ")}, ${revExpr}) ` +
    `ON CONFLICT(id) DO UPDATE SET ${BOOK_COLS.map((c) => `${c} = excluded.${c}`).join(", ")}, rev = excluded.rev ` +
    `WHERE books.rev = ?`;
  return db.prepare(sql).bind(b.id, ...values, expectedRev);
}

export function upsertReviewStmt(db: D1Database, r: Review, expectedRev: number, revExpr: string): D1PreparedStatement {
  const values = REVIEW_COLS.map((c) => (c === "field_clock" ? JSON.stringify(r.field_clock) : (r as unknown as Row)[c]));
  const sql =
    `INSERT INTO reviews (book_id, ${REVIEW_COLS.join(", ")}, rev) VALUES (?, ${REVIEW_COLS.map(() => "?").join(", ")}, ${revExpr}) ` +
    `ON CONFLICT(book_id) DO UPDATE SET ${REVIEW_COLS.map((c) => `${c} = excluded.${c}`).join(", ")}, rev = excluded.rev ` +
    `WHERE reviews.rev = ?`;
  return db.prepare(sql).bind(r.book_id, ...values, expectedRev);
}

/** Reserva `n` revisões numa única instrução; a k-ésima escrita do lote usa `revExpr(k)`. */
export function bumpRevStmt(db: D1Database, n: number): D1PreparedStatement {
  return db.prepare("UPDATE meta SET value = value + ? WHERE key = 'rev'").bind(n);
}
export function revExpr(n: number, k: number): string {
  // após o bump, value = antigo + n; a k-ésima escrita (0-based) recebe antigo + k + 1
  return `((SELECT value FROM meta WHERE key = 'rev') - ${n - 1 - k})`;
}
