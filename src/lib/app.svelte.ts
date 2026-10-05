// Estado reativo da interface. A fonte da verdade é o IndexedDB; isto é só um espelho dele.

import type { Book, Review } from "../../shared/model";
import { openEstanteDb } from "./db/idb";
import { LocalStore } from "./db/repo";
import { PdfFiles } from "./pdf/files";
import { SyncEngine, type Fetcher, type SyncStatus } from "./sync/engine";

const fetcher: Fetcher = (path, init) => fetch(path, { credentials: "same-origin", ...init });

class AppState {
  store!: LocalStore;
  engine!: SyncEngine;
  files!: PdfFiles;

  ready = $state(false);
  fatal = $state<string | null>(null);
  books = $state.raw<Book[]>([]);
  reviews = $state.raw<Map<string, Review>>(new Map());
  /** Livros cujo PDF atual está neste aparelho → tamanho em bytes. */
  offline = $state.raw<Map<string, number>>(new Map());
  sync = $state.raw<SyncStatus>({
    state: "idle",
    pending: 0,
    pendingIds: new Set(),
    failed: 0,
    uploads: new Map(),
    lastSync: null,
    error: null,
  });
  usedBytes = $state(0);
  quota = $state.raw<{ usage: number; quota: number } | null>(null);
  persisted = $state(false);

  private refreshing: Promise<void> | null = null;
  private refreshAgain = false;

  async init(): Promise<void> {
    try {
      const db = await openEstanteDb();
      this.store = await LocalStore.open(db);
      this.engine = new SyncEngine(this.store, fetcher);
      this.files = new PdfFiles(this.store, fetcher);
    } catch (e) {
      this.fatal =
        "Não foi possível abrir o armazenamento deste navegador. Se estiver numa janela anônima, abra numa janela normal.";
      console.error(e);
      return;
    }
    this.store.onChange(() => void this.refresh());
    this.engine.onStatus((s) => (this.sync = s));
    await this.refresh();
    this.ready = true;
    this.engine.start();
    this.persisted = (await navigator.storage?.persisted?.()) ?? false;
    window.addEventListener("pagehide", () => void this.engine.sync());
  }

  /** Recarrega tudo do IndexedDB. Chamadas em sequência viram uma só. */
  refresh(): Promise<void> {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        const [books, reviews] = await Promise.all([this.store.listBooks(), this.store.listReviews()]);
        this.books = books;
        this.reviews = new Map(reviews.map((r) => [r.book_id, r]));
        this.offline = await this.files.offlineIndex(books);
        this.usedBytes = await this.files.usedBytes();
        const est = await navigator.storage?.estimate?.();
        this.quota = est?.quota ? { usage: est.usage ?? 0, quota: est.quota } : null;
      } while (this.refreshAgain);
    })().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** Pede ao navegador para não apagar os PDFs guardados quando faltar espaço. */
  async ensurePersisted(): Promise<void> {
    if (this.persisted || !navigator.storage?.persist) return;
    this.persisted = await navigator.storage.persist();
  }

  categories = $derived([...new Set(this.books.map((b) => b.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt")));
}

export const app = new AppState();

export function catColor(name: string): string {
  if (!name) return "var(--muted)";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `var(--c${(h % 6) + 1})`;
}
