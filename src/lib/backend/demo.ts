// Demo pública: tudo fica no IndexedDB deste navegador. Sem motor de sincronização, sem /api.
// Os PDFs de exemplo são arquivos estáticos em /demo/.

import { DEMO_PDFS, attachMissingDemoPdfs, resetDemo, seedDemo } from "../../demo/seed";
import { idleStatus, type Fetcher, type SyncController } from "../sync/types";
import type { Backend } from "./types";

const SEEDED = "demoSeeded";

/** Responde `books/<id>/pdf` com o arquivo de exemplo daquele livro, se houver. */
const pdfFetcher: Fetcher = async (path) => {
  const id = /^books\/([^/]+)\/pdf$/.exec(path)?.[1];
  const file = id ? DEMO_PDFS[id] : undefined;
  if (file) {
    const res = await fetch(`/demo/${file}`);
    if (res.ok && (res.headers.get("content-type") ?? "").includes("pdf")) return res;
  }
  return new Response(JSON.stringify({ error: "sem PDF" }), { status: 404, headers: { "content-type": "application/json" } });
};

/** Sem servidor: sempre "em dia". */
class LocalOnlySync implements SyncController {
  status = idleStatus();
  onStatus(fn: (s: typeof this.status) => void) {
    fn(this.status);
    return () => {};
  }
  start() {}
  async sync() {}
  async retryNow() {}
}

export const backend: Backend = {
  mode: "demo",
  storeOptions: { localOnly: true },
  pdfFetcher,
  createSync: () => new LocalOnlySync(),
  loginUrl: null,
  hasRemotePdf: (bookId) => bookId in DEMO_PDFS,
  async prepare(store) {
    if (await store.db.get("meta", SEEDED)) {
      await attachMissingDemoPdfs(store);
      return;
    }
    await seedDemo(store);
    await store.db.put("meta", true, SEEDED);
  },
  restore: (store) => resetDemo(store),
};
