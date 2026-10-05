// PDFs guardados no aparelho. Todo PDF aberto fica salvo para leitura offline.

import { pdfState, type Book } from "../../../shared/model";
import { uploadItemId, type PdfFile } from "../db/idb";
import type { LocalStore } from "../db/repo";
import type { Fetcher } from "../sync/engine";

export class PdfError extends Error {
  constructor(
    readonly code: "offline" | "missing" | "uploading" | "auth" | "server",
    message: string,
  ) {
    super(message);
  }
}

export class PdfFiles {
  private listeners = new Set<() => void>();
  constructor(
    private readonly store: LocalStore,
    private readonly fetcher: Fetcher,
  ) {}

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private changed() {
    this.listeners.forEach((l) => l());
    this.store.notify();
  }

  /** Ids dos livros cujo PDF atual está neste aparelho, com o tamanho. */
  async offlineIndex(books: Book[]): Promise<Map<string, number>> {
    const byId = new Map(books.map((b) => [b.id, b.pdf_key]));
    const out = new Map<string, number>();
    const tx = this.store.db.transaction("pdfs");
    let cursor = await tx.store.openCursor();
    while (cursor) {
      const f = cursor.value;
      if (byId.get(f.book_id) === f.key) out.set(f.book_id, f.size);
      cursor = await cursor.continue();
    }
    return out;
  }

  async local(book: Book): Promise<PdfFile | null> {
    if (!book.pdf_key) return null;
    const f = await this.store.db.get("pdfs", book.id);
    return f && f.key === book.pdf_key ? f : null;
  }

  /** Devolve o PDF do aparelho ou baixa do servidor (e guarda). */
  async open(book: Book): Promise<Blob> {
    const f = await this.local(book);
    if (f) {
      void this.store.db.put("pdfs", { ...f, accessed_at: Date.now() });
      return f.blob;
    }
    return this.download(book);
  }

  async download(book: Book): Promise<Blob> {
    if (!book.pdf_key) throw new PdfError("missing", "Este livro ainda não tem PDF.");
    if (pdfState(book) === "uploading") {
      throw new PdfError("uploading", "O PDF ainda está sendo enviado por outro aparelho. Tente de novo quando ele sincronizar.");
    }
    let res: Response;
    try {
      res = await this.fetcher(`/api/books/${book.id}/pdf`, { redirect: "manual" });
    } catch {
      throw new PdfError("offline", "Sem conexão. Este PDF ainda não foi baixado para este aparelho.");
    }
    if (res.type === "opaqueredirect" || res.status === 401 || res.status === 403) {
      throw new PdfError("auth", "Sua sessão expirou. Entre de novo para baixar o PDF.");
    }
    if (res.status === 404) throw new PdfError("missing", "O PDF não foi encontrado no servidor.");
    if (!res.ok) throw new PdfError("server", `O servidor respondeu ${res.status}. Tente de novo.`);
    const blob = await res.blob();
    const key = res.headers.get("x-pdf-key") ?? book.pdf_key;
    const now = Date.now();
    await this.store.db.put("pdfs", {
      book_id: book.id,
      key,
      blob,
      size: blob.size,
      file_name: book.file_name,
      saved_at: now,
      accessed_at: now,
    });
    this.changed();
    return blob;
  }

  /** Libera o espaço do PDF neste aparelho. Não deixa apagar um PDF que ainda não subiu. */
  async release(bookId: string): Promise<boolean> {
    if (await this.store.db.get("outbox", uploadItemId(bookId))) return false;
    await this.store.db.delete("pdfs", bookId);
    this.changed();
    return true;
  }

  async releaseAll(): Promise<number> {
    const pendingUploads = new Set((await this.store.outbox()).filter((i) => i.kind === "upload").map((i) => i.id));
    const tx = this.store.db.transaction("pdfs", "readwrite");
    let freed = 0;
    let cursor = await tx.store.openCursor();
    while (cursor) {
      if (!pendingUploads.has(uploadItemId(cursor.value.book_id))) {
        freed += cursor.value.size;
        await cursor.delete();
      }
      cursor = await cursor.continue();
    }
    await tx.done;
    this.changed();
    return freed;
  }

  async usedBytes(): Promise<number> {
    let total = 0;
    const tx = this.store.db.transaction("pdfs");
    let cursor = await tx.store.openCursor();
    while (cursor) {
      total += cursor.value.size;
      cursor = await cursor.continue();
    }
    return total;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(1).replace(".", ",")} MB`;
  return `${(n / 1073741824).toFixed(2).replace(".", ",")} GB`;
}
