// Motor de sincronização. A interface nunca espera por ele: lê e escreve no IndexedDB,
// e o motor envia a fila de saída e puxa mudanças quando dá.

import { PART_SIZE, type Book, type Change, type ChangesResponse, type Review } from "../../../shared/model";
import { applyRemote } from "../../../shared/merge";
import { recordItemId, uploadItemId, type OutboxItem, type RecordItem, type UploadItem } from "../db/idb";
import type { LocalStore } from "../db/repo";

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export type SyncState = "idle" | "syncing" | "offline" | "auth" | "error";

export interface SyncStatus {
  state: SyncState;
  /** Itens na fila de saída. */
  pending: number;
  /** Livros com alguma alteração ainda não confirmada pelo servidor. */
  pendingIds: Set<string>;
  /** Itens rejeitados pelo servidor. */
  failed: number;
  /** Progresso de upload por livro (0 a 1). */
  uploads: Map<string, number>;
  lastSync: number | null;
  error: string | null;
  /** Login feito, mas o Worker recusou (segredos do Access ou e-mail não batem). */
  denied?: boolean;
}

export const PUSH_BATCH = 20;
const MAX_BACKOFF = 5 * 60_000;

export function backoff(attempts: number, random = Math.random): number {
  const base = Math.min(MAX_BACKOFF, 1000 * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.5 + random() / 2));
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Sem acesso à API. `denied`: o Access deixou passar, mas o Worker recusou (configuração). */
class AuthError extends Error {
  constructor(
    message: string,
    readonly denied = false,
  ) {
    super(message);
  }
}

export interface EngineOptions {
  now?: () => number;
  random?: () => number;
  partSize?: number;
}

export class SyncEngine {
  status: SyncStatus = {
    state: "idle",
    pending: 0,
    pendingIds: new Set(),
    failed: 0,
    uploads: new Map(),
    lastSync: null,
    error: null,
  };
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(s: SyncStatus) => void>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly partSize: number;
  private detach: (() => void)[] = [];

  constructor(
    private readonly store: LocalStore,
    private readonly fetcher: Fetcher,
    opts: EngineOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.partSize = opts.partSize ?? PART_SIZE;
  }

  onStatus(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((l) => l(this.status));
  }

  /** Liga os gatilhos: volta da conexão, foco da janela, intervalo e escritas locais. */
  start(intervalMs = 60_000): void {
    const kick = () => void this.retryNow();
    const onVisible = () => document.visibilityState === "visible" && kick();
    window.addEventListener("online", kick);
    window.addEventListener("focus", kick);
    document.addEventListener("visibilitychange", onVisible);
    const offStore = this.store.onChange(() => {
      void this.refreshCounts();
      this.schedule();
    });
    this.interval = setInterval(() => void this.sync(), intervalMs);
    this.detach = [
      () => window.removeEventListener("online", kick),
      () => window.removeEventListener("focus", kick),
      () => document.removeEventListener("visibilitychange", onVisible),
      offStore,
    ];
    void this.refreshCounts();
    void this.sync();
  }

  stop(): void {
    this.detach.forEach((d) => d());
    if (this.interval) clearInterval(this.interval);
    if (this.timer) clearTimeout(this.timer);
  }

  /**
   * Agenda uma sincronização em breve. Várias escritas seguidas (páginas viradas, digitação)
   * viram um único envio.
   */
  schedule(delay = 2000): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync();
    }, delay);
  }

  /** Zera o backoff e sincroniza já (voltou a conexão, janela em foco, botão "tentar agora"). */
  async retryNow(): Promise<void> {
    const tx = this.store.db.transaction("outbox", "readwrite");
    for (const item of await tx.store.getAll()) {
      if (item.next_at > 0 && !item.failed) await tx.store.put({ ...item, next_at: 0 });
    }
    await tx.done;
    if (this.status.state === "auth") this.set({ state: "idle", error: null, denied: false });
    return this.sync();
  }

  /** Uma rodada completa: envia, puxa, sobe PDFs. Chamadas concorrentes viram uma só. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.round();
      } while (this.again && this.status.state !== "auth" && this.status.state !== "offline");
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async round(): Promise<void> {
    if (this.status.state === "auth") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.set({ state: "offline" });
      await this.refreshCounts();
      return;
    }
    this.set({ state: "syncing" });
    try {
      await this.pushRecords();
      await this.pull();
      await this.pushUploads();
      this.set({ state: "idle", lastSync: this.now(), error: null });
    } catch (e) {
      if (e instanceof AuthError) this.set({ state: "auth", error: e.message, denied: e.denied });
      else if (e instanceof TypeError) this.set({ state: "offline", error: null });
      else this.set({ state: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      await this.refreshCounts();
    }
  }

  async refreshCounts(): Promise<void> {
    const items = await this.store.outbox();
    const pendingIds = new Set(items.map((i) => (i.kind === "record" ? i.rid : i.book_id)));
    this.set({ pending: items.length, pendingIds, failed: items.filter((i) => i.failed).length });
  }

  // ---------- HTTP ----------

  private async request(path: string, init?: RequestInit): Promise<Response> {
    // `manual`: se a sessão do Access expirou, ele responde com redirect para o login.
    // Seguir esse redirect falharia por CORS e pareceria falta de rede.
    const res = await this.fetcher(path, { redirect: "manual", ...init });
    if (res.status === 403 && res.headers.get("content-type")?.includes("application/json")) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      throw new AuthError(`O servidor recusou o login: ${error ?? "acesso negado"}.`, true);
    }
    if (res.type === "opaqueredirect" || res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
      throw new AuthError("Sua sessão expirou. Entre de novo para sincronizar.");
    }
    return res;
  }

  private async json<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new HttpError(res.status, body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  // ---------- envio de registros ----------

  private async dueRecords(): Promise<RecordItem[]> {
    const now = this.now();
    const items = (await this.store.outbox()).filter(
      (i): i is RecordItem => i.kind === "record" && !i.failed && i.next_at <= now,
    );
    // Livros antes de resenhas, para a resenha nunca chegar antes do livro.
    return items.sort((a, b) => (a.table === b.table ? 0 : a.table === "books" ? -1 : 1));
  }

  private async pushRecords(): Promise<void> {
    let items = await this.dueRecords();
    while (items.length) {
      const batch = items.slice(0, PUSH_BATCH);
      items = items.slice(PUSH_BATCH);
      await this.pushBatch(batch);
    }
  }

  private async pushBatch(batch: RecordItem[]): Promise<void> {
    const changes: Change[] = batch.map((i) => ({
      table: i.table,
      id: i.rid,
      fields: i.fields,
      clock: i.clock,
      ...(i.created_at ? { created_at: i.created_at } : {}),
    }));
    let res: Response;
    try {
      res = await this.request("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes }),
      });
    } catch (e) {
      if (!(e instanceof AuthError)) await this.postpone(batch);
      throw e;
    }
    if (res.ok) {
      await this.ack(batch);
      return;
    }
    if (res.status === 400) {
      // Um item inválido não pode travar a fila: isola e marca só o culpado.
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      if (batch.length === 1) return this.markFailed(batch[0], error ?? "rejeitado pelo servidor");
      for (const item of batch) await this.pushBatch([item]);
      return;
    }
    await this.postpone(batch);
    throw new HttpError(res.status, `O servidor respondeu ${res.status}`);
  }

  /**
   * Remove da fila só os campos enviados que não mudaram desde então.
   * Se o usuário editou de novo durante o envio, o valor novo continua pendente.
   */
  private async ack(batch: RecordItem[]): Promise<void> {
    const tx = this.store.db.transaction("outbox", "readwrite");
    for (const sent of batch) {
      const cur = (await tx.store.get(sent.id)) as RecordItem | undefined;
      if (!cur || cur.kind !== "record") continue;
      const fields = { ...cur.fields };
      const clock = { ...cur.clock };
      for (const f of Object.keys(sent.clock)) {
        const a = sent.clock[f];
        const b = clock[f];
        if (b && a[0] === b[0] && a[1] === b[1]) {
          delete fields[f];
          delete clock[f];
        }
      }
      if (Object.keys(fields).length === 0) await tx.store.delete(sent.id);
      else await tx.store.put({ ...cur, fields, clock, attempts: 0, next_at: 0 });
    }
    await tx.done;
  }

  private async postpone(items: OutboxItem[]): Promise<void> {
    const tx = this.store.db.transaction("outbox", "readwrite");
    for (const sent of items) {
      const cur = await tx.store.get(sent.id);
      if (!cur) continue;
      const attempts = cur.attempts + 1;
      await tx.store.put({ ...cur, attempts, next_at: this.now() + backoff(attempts, this.random) });
    }
    await tx.done;
  }

  private async markFailed(item: OutboxItem, error: string): Promise<void> {
    const cur = await this.store.db.get("outbox", item.id);
    if (cur) await this.store.db.put("outbox", { ...cur, failed: error });
  }

  // ---------- recebimento ----------

  private async pull(): Promise<void> {
    let more = true;
    while (more) {
      const cursor = ((await this.store.db.get("meta", "cursor")) as number | undefined) ?? 0;
      const res = await this.request(`/api/changes?since=${cursor}`);
      const page = await this.json<ChangesResponse>(res);
      await this.applyPage(page);
      more = page.more;
    }
  }

  async applyPage(page: ChangesResponse): Promise<void> {
    const db = this.store.db;
    const tx = db.transaction(["books", "reviews", "outbox", "pdfs", "meta"], "readwrite");
    const outbox = tx.objectStore("outbox");
    const pendingFields = async (table: "books" | "reviews", id: string) => {
      const item = (await outbox.get(recordItemId(table, id))) as RecordItem | undefined;
      return item && !item.failed ? Object.keys(item.fields) : [];
    };
    const touched = page.books.length + page.reviews.length > 0;
    for (const remote of page.books) {
      const local = await tx.objectStore("books").get(remote.id);
      if (remote.deleted_at != null) {
        await tx.objectStore("books").put(remote);
        await tx.objectStore("reviews").delete(remote.id);
        await tx.objectStore("pdfs").delete(remote.id);
        await outbox.delete(recordItemId("books", remote.id));
        await outbox.delete(recordItemId("reviews", remote.id));
        await outbox.delete(uploadItemId(remote.id));
        continue;
      }
      if (local?.deleted_at != null) continue; // exclusão local ainda não enviada
      const merged: Book = applyRemote(local, remote, await pendingFields("books", remote.id));
      await tx.objectStore("books").put(merged);
      // O PDF foi trocado em outro aparelho: a cópia local antiga não serve mais.
      const file = await tx.objectStore("pdfs").get(remote.id);
      if (file && file.key !== merged.pdf_key) await tx.objectStore("pdfs").delete(remote.id);
    }
    for (const remote of page.reviews) {
      const book = await tx.objectStore("books").get(remote.book_id);
      if (book?.deleted_at != null) continue;
      const local = await tx.objectStore("reviews").get(remote.book_id);
      const merged: Review = applyRemote(local, remote, await pendingFields("reviews", remote.book_id));
      await tx.objectStore("reviews").put(merged);
    }
    await tx.objectStore("meta").put(page.cursor, "cursor");
    await tx.done;
    if (touched) this.store.notify();
  }

  // ---------- upload de PDFs ----------

  private async pushUploads(): Promise<void> {
    const now = this.now();
    const items = (await this.store.outbox()).filter(
      (i): i is UploadItem => i.kind === "upload" && !i.failed && i.next_at <= now,
    );
    for (const item of items) {
      // O livro com esta chave precisa estar no servidor antes do upload começar.
      const rec = (await this.store.db.get("outbox", recordItemId("books", item.book_id))) as RecordItem | undefined;
      if (rec && "pdf_key" in rec.fields) continue;
      try {
        await this.upload(item);
      } catch (e) {
        if (!(e instanceof AuthError)) await this.postpone([item]);
        throw e;
      } finally {
        const uploads = new Map(this.status.uploads);
        uploads.delete(item.book_id);
        this.set({ uploads });
      }
    }
  }

  private async saveUpload(item: UploadItem): Promise<boolean> {
    // Grava o progresso, a menos que o upload tenha sido trocado ou cancelado no meio.
    const tx = this.store.db.transaction("outbox", "readwrite");
    const cur = (await tx.store.get(item.id)) as UploadItem | undefined;
    const same = !!cur && cur.key === item.key;
    if (same) await tx.store.put({ ...item, attempts: 0 });
    await tx.done;
    return same;
  }

  private async dropUpload(item: UploadItem): Promise<void> {
    const tx = this.store.db.transaction("outbox", "readwrite");
    const cur = (await tx.store.get(item.id)) as UploadItem | undefined;
    if (cur && cur.key === item.key) await tx.store.delete(item.id);
    await tx.done;
  }

  private async upload(item: UploadItem): Promise<void> {
    const file = await this.store.db.get("pdfs", item.book_id);
    if (!file || file.key !== item.key) {
      await this.markFailed(item, "O arquivo deste PDF não está mais neste aparelho.");
      return;
    }
    const base = `/api/books/${item.book_id}/pdf/uploads`;
    const keyQ = `key=${encodeURIComponent(item.key)}`;
    let job: UploadItem = { ...item, parts: [...item.parts] };

    if (!job.upload_id) {
      const res = await this.request(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: job.key }),
      });
      if (res.status === 409) return this.dropUpload(job); // livro excluído ou PDF trocado
      const { uploadId } = await this.json<{ uploadId: string }>(res);
      job = { ...job, upload_id: uploadId, parts: [] };
      if (!(await this.saveUpload(job))) return;
    }

    const total = Math.max(1, Math.ceil(file.size / this.partSize));
    for (let n = job.parts.length + 1; n <= total; n++) {
      this.set({ uploads: new Map(this.status.uploads).set(job.book_id, (n - 1) / total) });
      const chunk = file.blob.slice((n - 1) * this.partSize, Math.min(file.size, n * this.partSize));
      const res = await this.request(`${base}/${job.upload_id}/parts/${n}?${keyQ}`, { method: "PUT", body: chunk });
      if (res.status === 404) {
        // O upload expirou no R2: recomeça do zero na próxima rodada.
        await this.saveUpload({ ...job, upload_id: null, parts: [] });
        throw new HttpError(404, "upload expirou");
      }
      const part = await this.json<{ partNumber: number; etag: string }>(res);
      job = { ...job, parts: [...job.parts, part] };
      if (!(await this.saveUpload(job))) return;
    }

    const res = await this.request(`${base}/${job.upload_id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: job.key, parts: job.parts }),
    });
    if (res.status === 409) return this.dropUpload(job);
    if (res.status === 404) {
      await this.saveUpload({ ...job, upload_id: null, parts: [] });
      throw new HttpError(404, "upload expirou");
    }
    await this.json(res);
    await this.dropUpload(job);
    // Marca localmente como pronto; o próximo pull confirma.
    const tx = this.store.db.transaction("books", "readwrite");
    const book = await tx.store.get(job.book_id);
    if (book && book.pdf_key === job.key) await tx.store.put({ ...book, pdf_ready_key: job.key });
    await tx.done;
    this.store.notify();
  }
}
