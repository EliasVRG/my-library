// Simulação de dois aparelhos para a página /demo/sync. Usa o código real: LocalStore (fila de
// saída), SyncEngine (push/pull/backoff) e o merge por campo de shared/merge.ts, que roda no
// MemoryServer como roda no Worker. Só a rede é falsa.

import { deleteDB } from "idb";
import type { Book, Review } from "../../shared/model";
import { openEstanteDb } from "../lib/db/idb";
import { LocalStore } from "../lib/db/repo";
import { SyncEngine } from "../lib/sync/engine";
import type { Fetcher, SyncStatus } from "../lib/sync/types";
import { MemoryServer } from "./memory-server";

export interface DeviceView {
  book: Book | undefined;
  review: Review | undefined;
  status: SyncStatus;
  pending: number;
}

export class SimDevice {
  online = true;
  private listeners = new Set<(v: DeviceView) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  view: DeviceView | null = null;

  private constructor(
    readonly name: string,
    readonly store: LocalStore,
    readonly engine: SyncEngine,
    readonly bookId: string,
  ) {}

  static async create(name: string, dbName: string, server: MemoryServer, bookId: string): Promise<SimDevice> {
    await deleteDB(dbName);
    const store = await LocalStore.open(await openEstanteDb(dbName));
    let device!: SimDevice;
    // A "rede" deste aparelho: cai com TypeError quando ele está offline, como um fetch real.
    const fetcher: Fetcher = (path, init) =>
      device.online ? server.fetcher(path, init) : Promise.reject(new TypeError("Failed to fetch (offline)"));
    const engine = new SyncEngine(store, fetcher);
    device = new SimDevice(name, store, engine, bookId);
    store.onChange(() => {
      void device.refresh();
      engine.schedule(400);
    });
    engine.onStatus(() => void device.refresh());
    return device;
  }

  onView(fn: (v: DeviceView) => void): () => void {
    this.listeners.add(fn);
    if (this.view) fn(this.view);
    return () => this.listeners.delete(fn);
  }

  async refresh(): Promise<void> {
    const [book, review, outbox] = await Promise.all([
      this.store.getBook(this.bookId),
      this.store.getReview(this.bookId),
      this.store.outbox(),
    ]);
    this.view = { book, review, status: this.engine.status, pending: outbox.length };
    this.listeners.forEach((l) => l(this.view!));
  }

  /** Puxa mudanças do "servidor" periodicamente, como o app faz a cada minuto (aqui, mais rápido). */
  start(intervalMs = 1500): void {
    this.timer = setInterval(() => this.online && void this.engine.sync(), intervalMs);
  }

  async setOnline(online: boolean): Promise<void> {
    this.online = online;
    if (online) await this.engine.retryNow();
    else await this.refresh();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

export async function createSimulation() {
  const server = new MemoryServer();
  const bookId = "5e5e5e5e-0000-4000-8000-000000000001";
  const a = await SimDevice.create("Computador", "estante-sim-computador", server, bookId);
  const b = await SimDevice.create("Celular", "estante-sim-celular", server, bookId);
  // O livro nasce no computador (com id fixo, para os dois painéis acompanharem o mesmo livro)
  // e chega ao celular pela sincronização.
  await a.store.importChanges([
    {
      table: "books",
      id: bookId,
      fields: { title: "Dom Casmurro", author: "Machado de Assis", category: "Romance", status: "lendo", pages: 256, current_page: 12 },
      clock: Object.fromEntries(["title", "author", "category", "status", "pages", "current_page"].map((f) => [f, [Date.now(), a.store.deviceId]])),
      created_at: Date.now(),
    },
  ]);
  await a.engine.sync();
  await b.engine.sync();
  await Promise.all([a.refresh(), b.refresh()]);
  a.start();
  b.start();
  return { server, a, b };
}
