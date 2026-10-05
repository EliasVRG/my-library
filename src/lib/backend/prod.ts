// Produção: sincroniza com o Worker (D1/R2) atrás do Cloudflare Access.
import { SyncEngine } from "../sync/engine";
import { API_BASE, httpFetcher } from "../sync/http";
import type { Backend } from "./types";

export const backend: Backend = {
  mode: "prod",
  storeOptions: {},
  pdfFetcher: httpFetcher,
  createSync: (store) => new SyncEngine(store, httpFetcher),
  loginUrl: `${API_BASE}login`,
};
