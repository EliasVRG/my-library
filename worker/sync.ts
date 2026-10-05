import { emptyReviewData, type Book, type Change, type ChangesResponse, type Review } from "../shared/model";
import { mergeBook, mergeReview } from "../shared/merge";
import { parseChange } from "../shared/validate";
import type { AppEnv } from "./env";
import {
  bumpRevStmt,
  loadBooks,
  loadReviews,
  newBook,
  newReview,
  revExpr,
  rowToBook,
  rowToReview,
  upsertBookStmt,
  upsertReviewStmt,
} from "./store";

/**
 * Cada registro alterado custa uma query (uma exclusão custa duas: livro e resenha).
 * O plano gratuito do D1 permite 50 queries por invocação.
 */
export const MAX_CHANGES_PER_PUSH = 20;
const PAGE = 500;
const MAX_ATTEMPTS = 3;

export class BadRequest extends Error {}

export function parseChanges(body: unknown, now: number): Change[] {
  const raw = (body as { changes?: unknown })?.changes;
  if (!Array.isArray(raw)) throw new BadRequest("corpo deve ter `changes`");
  if (raw.length > MAX_CHANGES_PER_PUSH) throw new BadRequest(`no máximo ${MAX_CHANGES_PER_PUSH} alterações por envio`);
  return raw.map((c, i) => {
    const parsed = parseChange(c, now);
    if (typeof parsed === "string") throw new BadRequest(`alteração ${i}: ${parsed}`);
    return parsed;
  });
}

interface Write {
  kind: "book" | "review";
  record: Book | Review;
  expectedRev: number;
}

/**
 * Aplica as alterações com merge por campo. Devolve as chaves do R2 que deixaram de ser usadas.
 * Se outra requisição gravar o mesmo registro no meio do caminho, refaz o merge (até 3 vezes).
 */
export async function applyChanges(env: AppEnv, changes: Change[], now = Date.now()): Promise<string[]> {
  let pending = changes;
  const orphanKeys = new Set<string>();
  for (let attempt = 0; attempt < MAX_ATTEMPTS && pending.length; attempt++) {
    const { writes, orphans } = await planWrites(env, pending, now);
    if (!writes.length) return [...orphanKeys];
    const n = writes.length;
    const stmts = [
      bumpRevStmt(env.DB, n),
      ...writes.map((w, k) =>
        w.kind === "book"
          ? upsertBookStmt(env.DB, w.record as Book, w.expectedRev, revExpr(n, k))
          : upsertReviewStmt(env.DB, w.record as Review, w.expectedRev, revExpr(n, k)),
      ),
    ];
    const results = await env.DB.batch(stmts);
    const lost = new Set<string>();
    writes.forEach((w, k) => {
      if (results[k + 1].meta.changes === 0) lost.add(idOf(w));
    });
    // Só descarta objetos do R2 de escritas que realmente entraram.
    for (const [id, keys] of orphans) if (!lost.has(id)) keys.forEach((k) => orphanKeys.add(k));
    // Refazer o merge do que já entrou é inofensivo: relógios iguais não alteram nada.
    pending = pending.filter((c) => lost.has(c.id));
  }
  if (pending.length) throw new Error("conflito persistente ao gravar; tente de novo");
  return [...orphanKeys];
}

function idOf(w: Write): string {
  return w.kind === "book" ? (w.record as Book).id : (w.record as Review).book_id;
}

async function planWrites(env: AppEnv, changes: Change[], now: number) {
  const db = env.DB;
  // Resenhas são carregadas para todos os ids: uma exclusão de livro também apaga a resenha.
  const ids = [...new Set(changes.map((c) => c.id))];
  const books = await loadBooks(db, ids);
  const reviews = await loadReviews(db, ids);

  const bookState = new Map<string, { rec: Book; expectedRev: number; changed: boolean }>();
  const reviewState = new Map<string, { rec: Review; expectedRev: number; changed: boolean }>();
  const orphans = new Map<string, string[]>();

  for (const c of changes) {
    if (c.table !== "books") continue;
    let st = bookState.get(c.id);
    if (!st) {
      const existing = books.get(c.id);
      st = { rec: existing ?? newBook(c.id, c.created_at ?? now), expectedRev: existing?.rev ?? 0, changed: !existing };
      bookState.set(c.id, st);
    }
    const before = st.rec;
    const { merged, changed } = mergeBook(before, c.fields, c.clock);
    if (!changed.length) continue;
    const dropped: string[] = [];
    if (merged.deleted_at != null) {
      if (before.pdf_key) dropped.push(before.pdf_key);
      if (before.pdf_ready_key && before.pdf_ready_key !== before.pdf_key) dropped.push(before.pdf_ready_key);
      merged.pdf_ready_key = null;
    } else if (changed.includes("pdf_key") && before.pdf_key !== merged.pdf_key) {
      if (before.pdf_key) dropped.push(before.pdf_key);
      if (before.pdf_ready_key && before.pdf_ready_key !== merged.pdf_key) dropped.push(before.pdf_ready_key);
      merged.pdf_ready_key = null;
    }
    if (dropped.length) orphans.set(c.id, [...(orphans.get(c.id) ?? []), ...dropped]);
    // Restauração de backup: o livro volta apontando para um PDF que ainda está no R2.
    if (changed.includes("pdf_key") && merged.pdf_key && merged.deleted_at == null) {
      if (await env.BUCKET.head(merged.pdf_key)) merged.pdf_ready_key = merged.pdf_key;
    }
    merged.updated_at = now;
    st.rec = merged;
    st.changed = true;
  }

  for (const c of changes) {
    if (c.table !== "reviews") continue;
    const book = bookState.get(c.id)?.rec ?? books.get(c.id);
    if (book?.deleted_at != null) continue; // resenha de livro excluído é ignorada
    let st = reviewState.get(c.id);
    if (!st) {
      const existing = reviews.get(c.id);
      st = { rec: existing ?? newReview(c.id, now), expectedRev: existing?.rev ?? 0, changed: false };
      reviewState.set(c.id, st);
    }
    const { merged, changed } = mergeReview(st.rec, c.fields, c.clock);
    if (!changed.length) continue;
    merged.updated_at = now;
    st.rec = merged;
    st.changed = true;
  }

  // Excluir um livro apaga também o texto da resenha.
  for (const [id, st] of bookState) {
    if (!st.changed || st.rec.deleted_at == null) continue;
    let rs = reviewState.get(id);
    if (!rs) {
      const existing = reviews.get(id);
      if (!existing) continue;
      rs = { rec: existing, expectedRev: existing.rev, changed: false };
      reviewState.set(id, rs);
    }
    rs.rec = { ...rs.rec, ...emptyReviewData(), field_clock: {}, updated_at: now };
    rs.changed = true;
  }

  const writes: Write[] = [];
  for (const st of bookState.values()) if (st.changed) writes.push({ kind: "book", record: st.rec, expectedRev: st.expectedRev });
  for (const st of reviewState.values()) if (st.changed) writes.push({ kind: "review", record: st.rec, expectedRev: st.expectedRev });
  return { writes, orphans };
}

export async function listChanges(db: D1Database, since: number): Promise<ChangesResponse> {
  const [meta, b, r] = await db.batch([
    db.prepare("SELECT value FROM meta WHERE key = 'rev'"),
    db.prepare("SELECT * FROM books WHERE rev > ? ORDER BY rev LIMIT ?").bind(since, PAGE + 1),
    db.prepare("SELECT * FROM reviews WHERE rev > ? ORDER BY rev LIMIT ?").bind(since, PAGE + 1),
  ]);
  const current = (meta.results[0] as { value: number }).value;
  type Item = { rev: number; book?: Book; review?: Review };
  const items: Item[] = [
    ...(b.results as Record<string, unknown>[]).map((row) => {
      const book = rowToBook(row);
      return { rev: book.rev, book };
    }),
    ...(r.results as Record<string, unknown>[]).map((row) => {
      const review = rowToReview(row);
      return { rev: review.rev, review };
    }),
  ].sort((x, y) => x.rev - y.rev);
  const more = items.length > PAGE;
  const page = more ? items.slice(0, PAGE) : items;
  return {
    books: page.filter((i) => i.book).map((i) => i.book!),
    reviews: page.filter((i) => i.review).map((i) => i.review!),
    cursor: more ? page[page.length - 1].rev : Math.max(current, since),
    more,
  };
}
