// Upload em partes (multipart do R2) e leitura dos PDFs.
// O cliente só começa um upload depois que o livro com aquele `pdf_key` já foi sincronizado.

import { Hono } from "hono";
import { isPdfKeyFor, isUuid } from "../shared/model";
import type { AppEnv } from "./env";
import { bumpRevStmt, getBook, revExpr } from "./store";

type Ctx = { Bindings: AppEnv };
export const pdf = new Hono<Ctx>();

const MAX_PARTS = 10_000;

pdf.use("/:id/*", async (c, next) => {
  if (!isUuid(c.req.param("id"))) return c.json({ error: "id inválido" }, 400);
  await next();
});

/** O livro existe, não foi excluído e ainda aponta para esta chave? */
async function currentKey(db: D1Database, id: string, key: string): Promise<"ok" | "gone" | "superseded"> {
  const book = await getBook(db, id);
  if (!book || book.deleted_at != null) return "gone";
  return book.pdf_key === key ? "ok" : "superseded";
}

pdf.post("/:id/pdf/uploads", async (c) => {
  const id = c.req.param("id");
  const { key } = await c.req.json<{ key?: unknown }>();
  if (!isPdfKeyFor(id, key)) return c.json({ error: "chave inválida" }, 400);
  const state = await currentKey(c.env.DB, id, key);
  if (state !== "ok") return c.json({ error: state }, 409);
  const upload = await c.env.BUCKET.createMultipartUpload(key, {
    httpMetadata: { contentType: "application/pdf" },
  });
  return c.json({ uploadId: upload.uploadId });
});

pdf.put("/:id/pdf/uploads/:uploadId/parts/:n", async (c) => {
  const id = c.req.param("id");
  const key = c.req.query("key");
  const n = Number(c.req.param("n"));
  if (!isPdfKeyFor(id, key)) return c.json({ error: "chave inválida" }, 400);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PARTS) return c.json({ error: "parte inválida" }, 400);
  if (!c.req.raw.body) return c.json({ error: "parte vazia" }, 400);
  const upload = c.env.BUCKET.resumeMultipartUpload(key, c.req.param("uploadId"));
  try {
    const part = await upload.uploadPart(n, c.req.raw.body);
    return c.json({ partNumber: part.partNumber, etag: part.etag });
  } catch (e) {
    if (isNoSuchUpload(e)) return c.json({ error: "upload expirou" }, 404);
    throw e;
  }
});

pdf.post("/:id/pdf/uploads/:uploadId/complete", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ key?: unknown; parts?: unknown }>();
  const { key } = body;
  if (!isPdfKeyFor(id, key)) return c.json({ error: "chave inválida" }, 400);
  const parts = body.parts;
  if (
    !Array.isArray(parts) ||
    !parts.length ||
    !parts.every((p) => p && Number.isInteger(p.partNumber) && typeof p.etag === "string")
  ) {
    return c.json({ error: "partes inválidas" }, 400);
  }
  const upload = c.env.BUCKET.resumeMultipartUpload(key, c.req.param("uploadId"));
  try {
    await upload.complete(parts as R2UploadedPart[]);
  } catch (e) {
    if (isNoSuchUpload(e)) {
      // Pode ser um reenvio depois de um complete que deu certo mas cuja resposta se perdeu.
      if (!(await c.env.BUCKET.head(key))) return c.json({ error: "upload expirou" }, 404);
    } else throw e;
  }
  const state = await currentKey(c.env.DB, id, key);
  if (state !== "ok") {
    c.executionCtx.waitUntil(c.env.BUCKET.delete(key));
    return c.json({ error: state }, 409);
  }
  await c.env.DB.batch([
    bumpRevStmt(c.env.DB, 1),
    c.env.DB.prepare(
      `UPDATE books SET pdf_ready_key = ?, updated_at = ?, rev = ${revExpr(1, 0)} WHERE id = ? AND pdf_key = ? AND deleted_at IS NULL`,
    ).bind(key, Date.now(), id, key),
  ]);
  return c.json({ ok: true });
});

pdf.delete("/:id/pdf/uploads/:uploadId", async (c) => {
  const id = c.req.param("id");
  const key = c.req.query("key");
  if (!isPdfKeyFor(id, key)) return c.json({ error: "chave inválida" }, 400);
  try {
    await c.env.BUCKET.resumeMultipartUpload(key, c.req.param("uploadId")).abort();
  } catch (e) {
    if (!isNoSuchUpload(e)) throw e;
  }
  return c.body(null, 204);
});

pdf.get("/:id/pdf", async (c) => {
  const book = await getBook(c.env.DB, c.req.param("id"));
  if (!book || book.deleted_at != null || !book.pdf_ready_key) return c.json({ error: "sem PDF" }, 404);
  const obj = await c.env.BUCKET.get(book.pdf_ready_key, { range: c.req.raw.headers, onlyIf: c.req.raw.headers });
  if (!obj) return c.json({ error: "sem PDF" }, 404);
  const headers = new Headers({
    "content-type": "application/pdf",
    "cache-control": "private, no-store",
    "accept-ranges": "bytes",
    etag: obj.httpEtag,
    "x-pdf-key": book.pdf_ready_key,
  });
  if (!("body" in obj)) return new Response(null, { status: 304, headers });
  const range = obj.range as { offset?: number; length?: number } | undefined;
  if (range && c.req.header("range")) {
    const offset = range.offset ?? 0;
    const length = range.length ?? obj.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
});

function isNoSuchUpload(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /NoSuchUpload|10024|does not exist|not found/i.test(msg);
}
