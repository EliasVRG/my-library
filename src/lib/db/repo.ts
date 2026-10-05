// Toda leitura e escrita da interface passa por aqui, sempre no IndexedDB.
// Cada escrita avança o relógio dos campos alterados e entra na fila de saída (outbox).

import {
  emptyBookData,
  emptyReviewData,
  pdfKeyFor,
  type Book,
  type BookData,
  type Change,
  type Clock,
  type FieldClock,
  type Review,
  type ReviewData,
  type Table,
} from "../../../shared/model";
import { mergeBook, mergeReview } from "../../../shared/merge";
import type { IDBPTransaction, StoreNames } from "idb";
import { recordItemId, uploadItemId, type EstanteDB, type EstanteSchema, type OutboxItem, type RecordItem, type UploadItem } from "./idb";

type Tx = IDBPTransaction<EstanteSchema, StoreNames<EstanteSchema>[], "readwrite">;

export interface NewBookInput {
  title: string;
  author?: string;
  category?: string;
  status?: BookData["status"];
  file?: File | Blob & { name?: string };
}

export class LocalStore {
  private lastTs = 0;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;

  constructor(
    readonly db: EstanteDB,
    readonly deviceId: string,
    private readonly now: () => number = Date.now,
  ) {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`estante-${db.name}`);
      this.channel.onmessage = () => this.listeners.forEach((l) => l());
    }
  }

  static async open(db: EstanteDB, now: () => number = Date.now): Promise<LocalStore> {
    let deviceId = (await db.get("meta", "deviceId")) as string | undefined;
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      await db.put("meta", deviceId, "deviceId");
    }
    return new LocalStore(db, deviceId, now);
  }

  /** Avisa a interface (nesta aba e nas outras) que algo mudou. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  notify(): void {
    this.listeners.forEach((l) => l());
    this.channel?.postMessage("change");
  }

  /** Relógio monotônico deste aparelho. */
  clock(): Clock {
    const ts = Math.max(this.now(), this.lastTs + 1);
    this.lastTs = ts;
    return [ts, this.deviceId];
  }

  // ---------- leitura ----------

  async listBooks(): Promise<Book[]> {
    return (await this.db.getAll("books")).filter((b) => b.deleted_at == null);
  }
  async listReviews(): Promise<Review[]> {
    return this.db.getAll("reviews");
  }
  async getBook(id: string): Promise<Book | undefined> {
    const b = await this.db.get("books", id);
    return b && b.deleted_at == null ? b : undefined;
  }
  async getReview(id: string): Promise<Review | undefined> {
    return this.db.get("reviews", id);
  }
  async outbox(): Promise<OutboxItem[]> {
    return this.db.getAll("outbox");
  }

  // ---------- escrita ----------

  async createBook(input: NewBookInput): Promise<Book> {
    const id = crypto.randomUUID();
    const now = this.now();
    const data: Partial<BookData> = {
      title: input.title.trim(),
      author: (input.author ?? "").trim(),
      category: (input.category ?? "").trim(),
      status: input.status ?? "quero",
    };
    if (input.file) {
      data.pdf_key = pdfKeyFor(id, crypto.randomUUID());
      data.file_name = input.file.name ?? "livro.pdf";
      data.pdf_size = input.file.size;
    }
    const tx = this.db.transaction(["books", "outbox", "pdfs"], "readwrite");
    const book: Book = {
      ...emptyBookData(),
      id,
      pdf_ready_key: null,
      created_at: now,
      updated_at: now,
      field_clock: {},
      rev: 0,
    };
    const fields = { ...emptyBookData(), ...data } as Record<string, unknown>;
    const clock = this.stamp(Object.keys(fields));
    Object.assign(book, fields, { field_clock: clock });
    await tx.objectStore("books").put(book);
    await this.enqueueRecord(tx, "books", id, fields, clock, now);
    if (input.file && data.pdf_key) await this.storePdfAndQueue(tx, id, data.pdf_key, input.file, data.file_name!);
    await tx.done;
    this.notify();
    return book;
  }

  async createMany(inputs: NewBookInput[]): Promise<void> {
    for (const i of inputs) await this.createBook(i);
  }

  async updateBook(id: string, patch: Partial<Omit<BookData, "deleted_at" | "pdf_key">>): Promise<Book | undefined> {
    const tx = this.db.transaction(["books", "outbox"], "readwrite");
    const book = await tx.objectStore("books").get(id);
    if (!book || book.deleted_at != null) {
      await tx.done;
      return undefined;
    }
    const keys = Object.keys(patch).filter((k) => (book as unknown as Record<string, unknown>)[k] !== (patch as Record<string, unknown>)[k]);
    if (!keys.length) {
      await tx.done;
      return book;
    }
    const fields = Object.fromEntries(keys.map((k) => [k, (patch as Record<string, unknown>)[k]]));
    const clock = this.stamp(keys);
    const next: Book = { ...book, ...fields, field_clock: { ...book.field_clock, ...clock }, updated_at: this.now() };
    await tx.objectStore("books").put(next);
    await this.enqueueRecord(tx, "books", id, fields, clock);
    await tx.done;
    this.notify();
    return next;
  }

  async updateReview(bookId: string, patch: Partial<ReviewData>): Promise<void> {
    const tx = this.db.transaction(["books", "reviews", "outbox"], "readwrite");
    const book = await tx.objectStore("books").get(bookId);
    if (!book || book.deleted_at != null) {
      await tx.done;
      return;
    }
    const current: Review = (await tx.objectStore("reviews").get(bookId)) ?? {
      ...emptyReviewData(),
      book_id: bookId,
      field_clock: {},
      updated_at: 0,
      rev: 0,
    };
    const keys = Object.keys(patch).filter((k) => current[k as keyof ReviewData] !== patch[k as keyof ReviewData]);
    if (!keys.length) {
      await tx.done;
      return;
    }
    const fields = Object.fromEntries(keys.map((k) => [k, patch[k as keyof ReviewData]]));
    const clock = this.stamp(keys);
    await tx.objectStore("reviews").put({ ...current, ...fields, field_clock: { ...current.field_clock, ...clock }, updated_at: this.now() });
    await this.enqueueRecord(tx, "reviews", bookId, fields, clock);
    await tx.done;
    this.notify();
  }

  /** Anexa ou troca o PDF: nova chave, arquivo guardado localmente, upload na fila. */
  async attachPdf(bookId: string, file: Blob & { name?: string }): Promise<void> {
    const tx = this.db.transaction(["books", "outbox", "pdfs"], "readwrite");
    const book = await tx.objectStore("books").get(bookId);
    if (!book || book.deleted_at != null) {
      await tx.done;
      return;
    }
    const key = pdfKeyFor(bookId, crypto.randomUUID());
    const fields = { pdf_key: key, file_name: file.name ?? "livro.pdf", pdf_size: file.size, pages: 0, current_page: 1 };
    const clock = this.stamp(Object.keys(fields));
    await tx.objectStore("books").put({ ...book, ...fields, field_clock: { ...book.field_clock, ...clock }, updated_at: this.now() });
    await this.enqueueRecord(tx, "books", bookId, fields, clock);
    await this.storePdfAndQueue(tx, bookId, key, file, fields.file_name);
    await tx.done;
    this.notify();
  }

  async deleteBook(bookId: string): Promise<void> {
    const tx = this.db.transaction(["books", "reviews", "outbox", "pdfs"], "readwrite");
    const book = await tx.objectStore("books").get(bookId);
    if (!book) {
      await tx.done;
      return;
    }
    const now = this.now();
    const clock = this.stamp(["deleted_at"]);
    await tx.objectStore("books").put({ ...book, deleted_at: now, field_clock: { ...book.field_clock, ...clock }, updated_at: now });
    await tx.objectStore("reviews").delete(bookId);
    await tx.objectStore("pdfs").delete(bookId);
    await tx.objectStore("outbox").delete(uploadItemId(bookId));
    await tx.objectStore("outbox").delete(recordItemId("reviews", bookId));
    // Só a exclusão importa daqui em diante; o resto pendente seria descartado pelo servidor.
    const prev = (await tx.objectStore("outbox").get(recordItemId("books", bookId))) as RecordItem | undefined;
    await tx.objectStore("outbox").put({
      id: recordItemId("books", bookId),
      kind: "record",
      table: "books",
      rid: bookId,
      fields: { deleted_at: now },
      clock,
      created_at: prev?.created_at,
      attempts: 0,
      next_at: 0,
    });
    await tx.done;
    this.notify();
  }

  /**
   * Importa registros de um backup. Usa os relógios originais, então um backup antigo
   * não sobrescreve edições mais novas, e livros excluídos não voltam.
   * Devolve quantos livros foram criados ou atualizados.
   */
  async importChanges(changes: Change[]): Promise<number> {
    const tx = this.db.transaction(["books", "reviews", "outbox"], "readwrite");
    const now = this.now();
    let touched = 0;
    for (const c of changes.filter((x) => x.table === "books")) {
      const local = await tx.objectStore("books").get(c.id);
      const base: Book = local ?? {
        ...emptyBookData(),
        id: c.id,
        pdf_ready_key: null,
        created_at: c.created_at ?? now,
        updated_at: now,
        field_clock: {},
        rev: 0,
      };
      const { merged, changed } = mergeBook(base, c.fields, c.clock);
      if (!changed.length && local) continue;
      await tx.objectStore("books").put({ ...merged, updated_at: now });
      const fields = Object.fromEntries(changed.map((f) => [f, (merged as unknown as Record<string, unknown>)[f]]));
      const clock = Object.fromEntries(changed.map((f) => [f, merged.field_clock[f]]));
      await this.enqueueRecord(tx, "books", c.id, fields, clock, merged.created_at);
      touched++;
    }
    for (const c of changes.filter((x) => x.table === "reviews")) {
      const book = await tx.objectStore("books").get(c.id);
      if (!book || book.deleted_at != null) continue;
      const base: Review = (await tx.objectStore("reviews").get(c.id)) ?? {
        ...emptyReviewData(),
        book_id: c.id,
        field_clock: {},
        updated_at: now,
        rev: 0,
      };
      const { merged, changed } = mergeReview(base, c.fields, c.clock);
      if (!changed.length) continue;
      await tx.objectStore("reviews").put({ ...merged, updated_at: now });
      const fields = Object.fromEntries(changed.map((f) => [f, (merged as unknown as Record<string, unknown>)[f]]));
      const clock = Object.fromEntries(changed.map((f) => [f, merged.field_clock[f]]));
      await this.enqueueRecord(tx, "reviews", c.id, fields, clock);
    }
    await tx.done;
    this.notify();
    return touched;
  }

  // ---------- auxiliares ----------

  private stamp(keys: string[]): FieldClock {
    const c = this.clock();
    return Object.fromEntries(keys.map((k) => [k, c]));
  }

  /** Junta com o que já estava pendente para o mesmo registro: fica o valor mais recente de cada campo. */
  private async enqueueRecord(tx: Tx, table: Table, rid: string, fields: Record<string, unknown>, clock: FieldClock, createdAt?: number) {
    const store = tx.objectStore("outbox");
    const id = recordItemId(table, rid);
    const prev = (await store.get(id)) as RecordItem | undefined;
    const item: RecordItem = {
      id,
      kind: "record",
      table,
      rid,
      fields: { ...(prev?.fields ?? {}), ...fields },
      clock: { ...(prev?.clock ?? {}), ...clock },
      created_at: prev?.created_at ?? createdAt,
      attempts: 0,
      next_at: 0,
    };
    await store.put(item);
  }

  private async storePdfAndQueue(tx: Tx, bookId: string, key: string, file: Blob, fileName: string) {
    const now = this.now();
    await tx.objectStore("pdfs").put({ book_id: bookId, key, blob: file, size: file.size, file_name: fileName, saved_at: now, accessed_at: now });
    const upload: UploadItem = { id: uploadItemId(bookId), kind: "upload", book_id: bookId, key, upload_id: null, parts: [], attempts: 0, next_at: 0 };
    await tx.objectStore("outbox").put(upload);
  }
}
