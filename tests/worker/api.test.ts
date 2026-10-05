import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { describe, expect, it } from "vitest";
import app from "../../worker/index";
import { verifyAccessToken } from "../../worker/auth";
import type { ChangesResponse } from "../../shared/model";

const ORIGIN = "http://localhost";

async function call(path: string, init: RequestInit = {}, origin = ORIGIN): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(origin + path, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const push = (changes: unknown[]) =>
  call("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ changes }) });

async function changes(since = 0): Promise<ChangesResponse> {
  return (await call(`/api/changes?since=${since}`)).json();
}

const uuid = () => crypto.randomUUID();
const keyFor = (id: string) => `pdfs/${id}/${uuid()}.pdf`;
const C = (ts: number, dev = "d1"): [number, string] => [ts, dev];

async function createBook(id: string, fields: Record<string, unknown> = {}) {
  const all = { title: "Livro", status: "quero", ...fields };
  const res = await push([{ table: "books", id, fields: all, clock: Object.fromEntries(Object.keys(all).map((k) => [k, C(1000)])), created_at: 1000 }]);
  expect(res.status).toBe(200);
}

async function uploadPdf(id: string, key: string, bytes: Uint8Array) {
  const start = await call(`/api/books/${id}/pdf/uploads`, { method: "POST", body: JSON.stringify({ key }) });
  expect(start.status).toBe(200);
  const { uploadId } = await start.json<{ uploadId: string }>();
  const part = await call(`/api/books/${id}/pdf/uploads/${uploadId}/parts/1?key=${encodeURIComponent(key)}`, { method: "PUT", body: bytes });
  expect(part.status).toBe(200);
  const p = await part.json<{ partNumber: number; etag: string }>();
  const done = await call(`/api/books/${id}/pdf/uploads/${uploadId}/complete`, { method: "POST", body: JSON.stringify({ key, parts: [p] }) });
  return done;
}

describe("sincronização", () => {
  it("push e changes com cursor", async () => {
    const before = await changes();
    const id = uuid();
    await createBook(id, { title: "Rápido e Devagar" });
    const after = await changes(before.cursor);
    expect(after.books.map((b) => b.title)).toEqual(["Rápido e Devagar"]);
    expect(after.cursor).toBeGreaterThan(before.cursor);
    expect((await changes(after.cursor)).books).toEqual([]);
  });

  it("merge por campo no servidor", async () => {
    const id = uuid();
    await createBook(id);
    await push([{ table: "books", id, fields: { current_page: 50 }, clock: { current_page: C(3000, "pc") } }]);
    await push([{ table: "books", id, fields: { title: "Novo", current_page: 7 }, clock: { title: C(4000, "cel"), current_page: C(2000, "cel") } }]);
    await push([{ table: "reviews", id, fields: { resumo: "R" }, clock: { resumo: C(2500, "cel") } }]);
    const { books, reviews } = await changes();
    const b = books.find((x) => x.id === id)!;
    expect(b.title).toBe("Novo");
    expect(b.current_page).toBe(50);
    expect(reviews.find((r) => r.book_id === id)?.resumo).toBe("R");
  });

  it("exclusão apaga a resenha e o PDF do R2, e o livro não volta", async () => {
    const id = uuid();
    const key = keyFor(id);
    await createBook(id, { pdf_key: key });
    expect((await uploadPdf(id, key, new TextEncoder().encode("%PDF-teste"))).status).toBe(200);
    await push([{ table: "reviews", id, fields: { resumo: "texto" }, clock: { resumo: C(1500) } }]);
    expect(await env.BUCKET.head(key)).not.toBeNull();

    await push([{ table: "books", id, fields: { deleted_at: 5000 }, clock: { deleted_at: C(5000) } }]);
    expect(await env.BUCKET.head(key)).toBeNull();
    await push([{ table: "books", id, fields: { title: "Volta!" }, clock: { title: C(9000, "outro") } }]);

    const { books, reviews } = await changes();
    const b = books.find((x) => x.id === id)!;
    expect(b.deleted_at).toBe(5000);
    expect(b.title).toBe("Livro");
    expect(reviews.find((r) => r.book_id === id)?.resumo).toBe("");
    expect((await call(`/api/books/${id}/pdf`)).status).toBe(404);
  });

  it("trocar o PDF remove o antigo do R2", async () => {
    const id = uuid();
    const k1 = keyFor(id);
    await createBook(id, { pdf_key: k1 });
    await uploadPdf(id, k1, new Uint8Array([1, 2, 3]));
    const k2 = keyFor(id);
    await push([{ table: "books", id, fields: { pdf_key: k2 }, clock: { pdf_key: C(2000) } }]);
    expect(await env.BUCKET.head(k1)).toBeNull();
    const b = (await changes()).books.find((x) => x.id === id)!;
    expect(b.pdf_ready_key).toBeNull();
  });

  it("rejeita lotes grandes demais e dados inválidos", async () => {
    const many = Array.from({ length: 21 }, () => ({ table: "books", id: uuid(), fields: {}, clock: {} }));
    expect((await push(many)).status).toBe(400);
    const bad = await push([{ table: "books", id: uuid(), fields: { status: "talvez" }, clock: { status: C(1) } }]);
    expect(bad.status).toBe(400);
    expect((await bad.json<{ error: string }>()).error).toContain("status");
  });

  it("paginação de changes", async () => {
    const start = (await changes()).cursor;
    for (let i = 0; i < 3; i++) await createBook(uuid());
    const all = await changes(start);
    expect(all.books).toHaveLength(3);
    expect(all.more).toBe(false);
  });
});

describe("PDF", () => {
  it("upload em partes, leitura completa e com Range", async () => {
    const id = uuid();
    const key = keyFor(id);
    await createBook(id, { pdf_key: key });
    const bytes = new TextEncoder().encode("%PDF-1.7 conteudo de teste");
    expect((await uploadPdf(id, key, bytes)).status).toBe(200);

    const full = await call(`/api/books/${id}/pdf`);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(bytes);

    const part = await call(`/api/books/${id}/pdf`, { headers: { range: "bytes=0-7" } });
    expect(part.status).toBe(206);
    expect(new TextDecoder().decode(await part.arrayBuffer())).toBe("%PDF-1.7");
    expect(part.headers.get("content-range")).toBe(`bytes 0-7/${bytes.length}`);
  });

  it("não aceita upload para chave que não é a do livro", async () => {
    const id = uuid();
    await createBook(id, { pdf_key: keyFor(id) });
    const res = await call(`/api/books/${id}/pdf/uploads`, { method: "POST", body: JSON.stringify({ key: keyFor(id) }) });
    expect(res.status).toBe(409);
    const other = await call(`/api/books/${id}/pdf/uploads`, { method: "POST", body: JSON.stringify({ key: keyFor(uuid()) }) });
    expect(other.status).toBe(400);
  });

  it("upload concluído depois de o PDF ser trocado é descartado", async () => {
    const id = uuid();
    const k1 = keyFor(id);
    await createBook(id, { pdf_key: k1 });
    const start = await call(`/api/books/${id}/pdf/uploads`, { method: "POST", body: JSON.stringify({ key: k1 }) });
    const { uploadId } = await start.json<{ uploadId: string }>();
    const part = await (
      await call(`/api/books/${id}/pdf/uploads/${uploadId}/parts/1?key=${encodeURIComponent(k1)}`, { method: "PUT", body: "abc" })
    ).json();
    await push([{ table: "books", id, fields: { pdf_key: keyFor(id) }, clock: { pdf_key: C(5000) } }]);
    const done = await call(`/api/books/${id}/pdf/uploads/${uploadId}/complete`, { method: "POST", body: JSON.stringify({ key: k1, parts: [part] }) });
    expect(done.status).toBe(409);
    expect(await env.BUCKET.head(k1)).toBeNull();
  });
});

describe("autenticação", () => {
  it("fora de localhost, DEV_SKIP_ACCESS não vale e o token é obrigatório", async () => {
    expect((await call("/api/me", {}, "https://estante.exemplo.com")).status).toBe(401);
    expect((await call("/api/me", { headers: { "cf-access-jwt-assertion": "lixo" } }, "https://estante.exemplo.com")).status).toBe(403);
  });

  it("em localhost com DEV_SKIP_ACCESS=1 libera", async () => {
    expect(await (await call("/api/me")).json()).toEqual({ email: "dev@localhost" });
  });

  it("valida assinatura, aud, emissor e e-mail", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const config = { teamDomain: "https://equipe.cloudflareaccess.com", aud: "aud-1", allowedEmails: ["eu@exemplo.com"] };
    const sign = (claims: Record<string, unknown>, iss = config.teamDomain, aud = config.aud) =>
      new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime("5m").sign(privateKey);

    expect(await verifyAccessToken(await sign({ email: "Eu@Exemplo.com" }), config, jwks)).toEqual({ ok: true, email: "eu@exemplo.com" });
    expect((await verifyAccessToken(await sign({ email: "outro@exemplo.com" }), config, jwks)).ok).toBe(false);
    expect((await verifyAccessToken(await sign({ email: "eu@exemplo.com" }, config.teamDomain, "outra-aud"), config, jwks)).ok).toBe(false);
    expect((await verifyAccessToken(await sign({ email: "eu@exemplo.com" }, "https://intruso.cloudflareaccess.com"), config, jwks)).ok).toBe(false);
    expect((await verifyAccessToken(await sign({}), config, jwks)).ok).toBe(false);
  });
});
