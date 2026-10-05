// Servidor em memória com as mesmas regras do Worker (merge, rev, multipart), para testar
// vários "aparelhos" sincronizando entre si sem rede.

import { mergeBook, mergeReview } from "../../shared/merge";
import { emptyBookData, emptyReviewData, type Book, type ChangesResponse, type Review } from "../../shared/model";
import { parseChange } from "../../shared/validate";

type Handler = (path: string, init: RequestInit) => Response | Promise<Response | undefined> | undefined;

export class FakeServer {
  rev = 0;
  books = new Map<string, Book>();
  reviews = new Map<string, Review>();
  objects = new Map<string, Uint8Array>();
  uploads = new Map<string, { key: string; parts: Map<number, Uint8Array> }>();
  calls: string[] = [];
  /** Intercepta requisições antes do comportamento normal (para simular falhas). */
  intercept: Handler | null = null;

  fetcher = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const method = init.method ?? "GET";
    this.calls.push(`${method} ${path.split("?")[0]}`);
    const hit = await this.intercept?.(path, init);
    if (hit) return hit;
    return this.handle(path, method, init);
  };

  private json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  private async handle(path: string, method: string, init: RequestInit): Promise<Response> {
    const url = new URL(path, "http://x");
    if (url.pathname === "/api/push" && method === "POST") {
      const { changes } = JSON.parse(init.body as string);
      const now = Date.now();
      for (const raw of changes) {
        const c = parseChange(raw, now);
        if (typeof c === "string") return this.json({ error: c }, 400);
      }
      for (const raw of changes) {
        const c = parseChange(raw, now) as Exclude<ReturnType<typeof parseChange>, string>;
        if (c.table === "books") {
          const base = this.books.get(c.id) ?? { ...emptyBookData(), id: c.id, pdf_ready_key: null, created_at: c.created_at ?? now, updated_at: now, field_clock: {}, rev: 0 };
          const { merged, changed } = mergeBook(base, c.fields, c.clock);
          if (changed.length || !this.books.has(c.id)) this.books.set(c.id, { ...merged, rev: ++this.rev });
          if (merged.deleted_at != null && this.reviews.has(c.id)) {
            this.reviews.set(c.id, { ...this.reviews.get(c.id)!, ...emptyReviewData(), rev: ++this.rev });
          }
        } else {
          if (this.books.get(c.id)?.deleted_at != null) continue;
          const base = this.reviews.get(c.id) ?? { ...emptyReviewData(), book_id: c.id, field_clock: {}, updated_at: now, rev: 0 };
          const { merged, changed } = mergeReview(base, c.fields, c.clock);
          if (changed.length) this.reviews.set(c.id, { ...merged, rev: ++this.rev });
        }
      }
      return this.json({ ok: true });
    }
    if (url.pathname === "/api/changes") {
      const since = Number(url.searchParams.get("since"));
      const res: ChangesResponse = {
        books: [...this.books.values()].filter((b) => b.rev > since),
        reviews: [...this.reviews.values()].filter((r) => r.rev > since),
        cursor: this.rev,
        more: false,
      };
      return this.json(structuredClone(res));
    }
    const m = /^\/api\/books\/([^/]+)\/pdf(?:\/uploads(?:\/([^/]+)(?:\/(parts\/(\d+)|complete))?)?)?$/.exec(url.pathname);
    if (m) {
      const [, id, uploadId, action, n] = m;
      const book = this.books.get(id);
      if (!uploadId && method === "POST") {
        const { key } = JSON.parse(init.body as string);
        if (!book || book.deleted_at != null || book.pdf_key !== key) return this.json({ error: "superseded" }, 409);
        const uid = `up-${this.uploads.size + 1}`;
        this.uploads.set(uid, { key, parts: new Map() });
        return this.json({ uploadId: uid });
      }
      if (action?.startsWith("parts") && method === "PUT") {
        const up = this.uploads.get(uploadId);
        if (!up) return this.json({ error: "upload expirou" }, 404);
        const data = new Uint8Array(await (init.body as Blob).arrayBuffer());
        up.parts.set(Number(n), data);
        return this.json({ partNumber: Number(n), etag: `e${n}` });
      }
      if (action === "complete") {
        const up = this.uploads.get(uploadId);
        if (!up) return this.json({ error: "upload expirou" }, 404);
        const ordered = [...up.parts.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d);
        const all = new Uint8Array(ordered.reduce((s, p) => s + p.length, 0));
        let off = 0;
        for (const p of ordered) {
          all.set(p, off);
          off += p.length;
        }
        this.objects.set(up.key, all);
        this.uploads.delete(uploadId);
        if (!book || book.pdf_key !== up.key) return this.json({ error: "superseded" }, 409);
        this.books.set(id, { ...book, pdf_ready_key: up.key, rev: ++this.rev });
        return this.json({ ok: true });
      }
      if (!uploadId && method === "GET") {
        if (!book?.pdf_ready_key) return this.json({ error: "sem PDF" }, 404);
        return new Response(this.objects.get(book.pdf_ready_key)!.slice(), { headers: { "x-pdf-key": book.pdf_ready_key } });
      }
    }
    return this.json({ error: "rota não encontrada" }, 404);
  }
}
