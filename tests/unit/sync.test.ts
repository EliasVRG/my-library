import { beforeEach, describe, expect, it } from "vitest";
import { openEstanteDb, recordItemId, uploadItemId, type RecordItem, type UploadItem } from "../../src/lib/db/idb";
import { LocalStore } from "../../src/lib/db/repo";
import { PdfFiles } from "../../src/lib/pdf/files";
import { SyncEngine, backoff } from "../../src/lib/sync/engine";
import { MemoryServer } from "../../src/demo/memory-server";

let t: number;
const now = () => t;
let dbCounter = 0;

async function device(server: MemoryServer, partSize = 10) {
  const db = await openEstanteDb(`teste-${++dbCounter}`);
  const store = await LocalStore.open(db, now);
  const engine = new SyncEngine(store, server.fetcher, { now, random: () => 1, partSize });
  return { db, store, engine };
}

const pdfFile = (text: string, name = "livro.pdf") => new File([text], name, { type: "application/pdf" });

beforeEach(() => {
  t = 1_000_000;
});

describe("fila de saída", () => {
  it("agrupa páginas viradas num único item e num único envio", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server);
    const b = await store.createBook({ title: "Livro" });
    await engine.sync();
    server.calls = [];
    for (let p = 2; p <= 30; p++) {
      t += 100;
      await store.updateBook(b.id, { current_page: p });
    }
    const items = await store.outbox();
    expect(items).toHaveLength(1);
    expect((items[0] as RecordItem).fields).toEqual({ current_page: 30 });
    await engine.sync();
    expect(server.calls.filter((c) => c === "POST push")).toHaveLength(1);
    expect(server.books.get(b.id)?.current_page).toBe(30);
    expect(await store.outbox()).toHaveLength(0);
  });

  it("reenvia depois de falha de rede, respeitando o backoff", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server);
    const b = await store.createBook({ title: "Offline" });
    server.intercept = () => {
      throw new TypeError("Failed to fetch");
    };
    await engine.sync();
    expect(engine.status.state).toBe("offline");
    const [item] = await store.outbox();
    expect(item.attempts).toBe(1);
    expect(item.next_at).toBe(t + backoff(1, () => 1));

    // Antes do prazo, o intervalo não tenta de novo.
    server.intercept = null;
    server.calls = [];
    await engine.sync();
    expect(server.calls).not.toContain("POST push");
    expect(await store.outbox()).toHaveLength(1);

    // Depois do prazo, envia.
    t += backoff(1, () => 1);
    await engine.sync();
    expect(server.books.get(b.id)?.title).toBe("Offline");
    expect(await store.outbox()).toHaveLength(0);
    expect(engine.status.state).toBe("idle");
  });

  it("o backoff cresce e tem teto", () => {
    expect(backoff(1, () => 1)).toBe(1000);
    expect(backoff(4, () => 1)).toBe(8000);
    expect(backoff(30, () => 1)).toBe(300_000);
    expect(backoff(3, () => 0)).toBe(2000);
  });

  it("voltar a conexão (retryNow) ignora o backoff", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server);
    await store.createBook({ title: "X" });
    server.intercept = () => new Response("", { status: 503 });
    await engine.sync();
    expect(engine.status.state).toBe("error");
    server.intercept = null;
    await engine.retryNow();
    expect(await store.outbox()).toHaveLength(0);
  });

  it("edição feita durante o envio continua pendente", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server);
    const b = await store.createBook({ title: "Antes" });
    await engine.sync();
    await store.updateReview(b.id, { resumo: "versão 1" });
    server.intercept = (path) => {
      if (path === "push") {
        server.intercept = null;
        // usuário digita enquanto a requisição está no ar
        return store.updateReview(b.id, { resumo: "versão 2" }).then(() => undefined);
      }
      return undefined;
    };
    t += 10;
    await engine.sync();
    expect(server.reviews.get(b.id)?.resumo).toBe("versão 1");
    const pending = (await store.db.get("outbox", recordItemId("reviews", b.id))) as RecordItem;
    expect(pending.fields).toEqual({ resumo: "versão 2" });
    // o pull não pode trocar o texto local pelo do servidor
    expect((await store.getReview(b.id))?.resumo).toBe("versão 2");
    await engine.sync();
    expect(server.reviews.get(b.id)?.resumo).toBe("versão 2");
  });

  it("um item rejeitado (400) não trava os outros", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server);
    const ok = await store.createBook({ title: "Bom" });
    const bad = await store.createBook({ title: "Ruim" });
    // corrompe o item no outbox
    const item = (await store.db.get("outbox", recordItemId("books", bad.id))) as RecordItem;
    await store.db.put("outbox", { ...item, fields: { ...item.fields, status: "inexistente" } });
    await engine.sync();
    expect(server.books.has(ok.id)).toBe(true);
    expect(server.books.has(bad.id)).toBe(false);
    const left = (await store.outbox()) as RecordItem[];
    expect(left).toHaveLength(1);
    expect(left[0].failed).toContain("status");
    expect(engine.status.failed).toBe(1);
  });

  it("sessão expirada do Access (redirect) pausa a sincronização sem perder nada", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server);
    await store.createBook({ title: "X" });
    server.intercept = () => new Response(null, { status: 302, headers: { location: "https://equipe.cloudflareaccess.com/" } });
    await engine.sync();
    expect(engine.status.state).toBe("auth");
    expect(await store.outbox()).toHaveLength(1);
    server.intercept = null;
    await engine.retryNow();
    expect(await store.outbox()).toHaveLength(0);
  });
  it("login recusado pelo Worker (403 com JSON) é diferente de sessão expirada", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server);
    await store.createBook({ title: "X" });
    server.intercept = () =>
      new Response(JSON.stringify({ error: "E-mail não autorizado" }), { status: 403, headers: { "content-type": "application/json" } });
    await engine.sync();
    expect(engine.status.state).toBe("auth");
    expect(engine.status.denied).toBe(true);
    expect(engine.status.error).toContain("E-mail não autorizado");
    expect(await store.outbox()).toHaveLength(1);
  });
});


describe("dois aparelhos", () => {
  it("resenha no celular e páginas no computador não se sobrescrevem", async () => {
    const server = new MemoryServer();
    const pc = await device(server);
    const cel = await device(server);
    const b = await pc.store.createBook({ title: "Rápido e Devagar" });
    await pc.engine.sync();
    await cel.engine.sync();

    // Os dois editam offline, em campos diferentes.
    t += 1000;
    await cel.store.updateReview(b.id, { resumo: "Sistema 1 e 2" });
    await cel.store.updateBook(b.id, { rating: 5 });
    t += 1000;
    await pc.store.updateBook(b.id, { current_page: 120, status: "lendo" });

    await cel.engine.sync();
    await pc.engine.sync();
    await cel.engine.sync();

    for (const d of [pc, cel]) {
      const book = await d.store.getBook(b.id);
      expect(book?.current_page).toBe(120);
      expect(book?.status).toBe("lendo");
      expect(book?.rating).toBe(5);
      expect((await d.store.getReview(b.id))?.resumo).toBe("Sistema 1 e 2");
    }
  });

  it("no mesmo campo, a última escrita vence nos dois aparelhos", async () => {
    const server = new MemoryServer();
    const a = await device(server);
    const c = await device(server);
    const b = await a.store.createBook({ title: "T" });
    await a.engine.sync();
    await c.engine.sync();
    t += 10;
    await c.store.updateReview(b.id, { notas: "antiga" });
    t += 10;
    await a.store.updateReview(b.id, { notas: "nova" });
    // a mais nova chega primeiro ao servidor
    await a.engine.sync();
    await c.engine.sync();
    await a.engine.sync();
    expect((await a.store.getReview(b.id))?.notas).toBe("nova");
    expect((await c.store.getReview(b.id))?.notas).toBe("nova");
  });

  it("exclusão propaga e vence uma edição feita depois em outro aparelho", async () => {
    const server = new MemoryServer();
    const a = await device(server);
    const c = await device(server);
    const b = await a.store.createBook({ title: "Vai sumir", file: pdfFile("conteudo-do-pdf") });
    await a.engine.sync();
    await c.engine.sync();
    await new PdfFiles(c.store, server.fetcher).open((await c.store.getBook(b.id))!);
    expect(await c.db.get("pdfs", b.id)).toBeTruthy();

    t += 10;
    await a.store.deleteBook(b.id);
    t += 10;
    await c.store.updateReview(b.id, { resumo: "escrevi depois" });
    await a.engine.sync();
    await c.engine.sync();

    expect(server.books.get(b.id)?.deleted_at).not.toBeNull();
    expect(server.reviews.get(b.id)?.resumo ?? "").toBe("");
    expect(await c.store.getBook(b.id)).toBeUndefined();
    expect(await c.store.getReview(b.id)).toBeUndefined();
    expect(await c.db.get("pdfs", b.id)).toBeUndefined();
    expect(await c.store.outbox()).toHaveLength(0);
    expect((await c.store.listBooks()).map((x) => x.id)).not.toContain(b.id);
  });
});

describe("upload de PDF", () => {
  it("o livro aparece na hora e o arquivo sobe em partes depois", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server, 10);
    const content = "x".repeat(25);
    const b = await store.createBook({ title: "Com PDF", file: pdfFile(content) });
    expect((await store.listBooks()).map((x) => x.title)).toEqual(["Com PDF"]);
    expect(await store.db.get("outbox", uploadItemId(b.id))).toBeTruthy();

    await engine.sync();
    expect(server.calls.filter((c) => c.startsWith("PUT"))).toHaveLength(3);
    expect(new TextDecoder().decode(server.objects.get(b.pdf_key!)!)).toBe(content);
    expect((await store.getBook(b.id))?.pdf_ready_key).toBe(b.pdf_key);
    expect(await store.outbox()).toHaveLength(0);
  });

  it("retoma da parte onde parou depois de uma falha", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server, 10);
    const b = await store.createBook({ title: "Grande", file: pdfFile("a".repeat(10) + "b".repeat(10) + "c".repeat(5)) });
    let putCount = 0;
    server.intercept = (_path, init) => {
      if (init.method === "PUT" && ++putCount === 2) throw new TypeError("Failed to fetch");
      return undefined;
    };
    await engine.sync();
    const job = (await store.db.get("outbox", uploadItemId(b.id))) as UploadItem;
    expect(job.parts.map((p) => p.partNumber)).toEqual([1]);
    expect(job.upload_id).toBeTruthy();

    server.intercept = null;
    server.calls = [];
    await engine.retryNow();
    const puts = server.calls.filter((c) => c.startsWith("PUT"));
    expect(puts).toEqual([`PUT books/${b.id}/pdf/uploads/${job.upload_id}/parts/2`, `PUT books/${b.id}/pdf/uploads/${job.upload_id}/parts/3`]);
    expect(new TextDecoder().decode(server.objects.get(b.pdf_key!)!)).toBe("a".repeat(10) + "b".repeat(10) + "c".repeat(5));
  });

  it("não começa o upload antes de o livro chegar ao servidor", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server, 10);
    await store.createBook({ title: "X", file: pdfFile("abc") });
    server.intercept = (path) => (path === "push" ? new Response("{}", { status: 500 }) : undefined);
    await engine.sync();
    expect(server.calls.some((c) => c.includes("/uploads"))).toBe(false);
  });

  it("trocar o PDF no meio do upload descarta o upload antigo", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server, 10);
    const b = await store.createBook({ title: "X", file: pdfFile("primeiro-arquivo-longo") });
    server.intercept = (path, init) => {
      if (init.method === "PUT") {
        server.intercept = null;
        return store.attachPdf(b.id, pdfFile("segundo", "novo.pdf")).then(() => undefined);
      }
      return undefined;
    };
    await engine.sync();
    await engine.sync();
    const book = (await store.getBook(b.id))!;
    expect(book.file_name).toBe("novo.pdf");
    expect(book.pdf_ready_key).toBe(book.pdf_key);
    expect(new TextDecoder().decode(server.objects.get(book.pdf_key!)!)).toBe("segundo");
    expect(await store.outbox()).toHaveLength(0);
  });
});

describe("remover só o PDF", () => {
  it("tira o PDF da nuvem e do aparelho, mas mantém livro, resenha e progresso", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server, 10);
    const b = await store.createBook({ title: "Guardar", file: pdfFile("conteudo") });
    await engine.sync();
    await store.updateBook(b.id, { current_page: 3, status: "lendo" });
    await store.updateReview(b.id, { resumo: "fica" });
    await engine.sync();
    const files = new PdfFiles(store, server.fetcher);
    expect(await (await files.fileFor((await store.getBook(b.id))!)).text()).toBe("conteudo");

    await store.removePdf(b.id);
    const local = (await store.getBook(b.id))!;
    expect(local.pdf_key).toBeNull();
    expect(local.current_page).toBe(3);
    expect(await store.db.get("pdfs", b.id)).toBeUndefined();
    await engine.sync();
    const remote = server.books.get(b.id)!;
    expect(remote.pdf_key).toBeNull();
    expect(remote.status).toBe("lendo");
    expect(server.reviews.get(b.id)?.resumo).toBe("fica");
    expect(await store.outbox()).toHaveLength(0);
  });

  it("cancela um upload que ainda não tinha subido", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server, 10);
    const b = await store.createBook({ title: "Offline", file: pdfFile("abc") });
    await store.removePdf(b.id);
    expect(await store.db.get("outbox", uploadItemId(b.id))).toBeUndefined();
    await engine.sync();
    expect(server.calls.some((c) => c.includes("/uploads"))).toBe(false);
    expect(server.books.get(b.id)?.pdf_key).toBeNull();
  });
});

describe("PDFs offline", () => {
  it("guarda o PDF aberto e não deixa liberar um PDF que ainda não subiu", async () => {
    const server = new MemoryServer();
    const { store, engine } = await device(server, 10);
    const b = await store.createBook({ title: "X", file: pdfFile("conteudo") });
    const files = new PdfFiles(store, server.fetcher);
    expect(await files.release(b.id)).toBe(false);
    await engine.sync();
    expect(await files.release(b.id)).toBe(true);
    expect((await files.offlineIndex(await store.listBooks())).has(b.id)).toBe(false);
    const blob = await files.open((await store.getBook(b.id))!);
    expect(await blob.text()).toBe("conteudo");
    expect((await files.offlineIndex(await store.listBooks())).get(b.id)).toBe(8);
  });
});
