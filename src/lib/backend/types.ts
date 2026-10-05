// O que muda entre produção e demo. O app importa `$backend`, que o Vite resolve para
// prod.ts ou demo.ts conforme o build: o código do outro modo nem entra no bundle.

import type { LocalStore, StoreOptions } from "../db/repo";
import type { Fetcher, SyncController } from "../sync/types";

export interface Backend {
  mode: "prod" | "demo";
  storeOptions: StoreOptions;
  /** Busca o PDF de um livro (`books/<id>/pdf`) quando ele não está no aparelho. */
  pdfFetcher: Fetcher;
  createSync(store: LocalStore): SyncController;
  /**
   * Há outra cópia do PDF fora deste aparelho? Sem ela, "liberar espaço" apagaria o único arquivo.
   * Omitido: sempre há (produção, depois que o upload termina).
   */
  hasRemotePdf?(bookId: string): boolean;
  /** Página que passa pelo login do Access. `null` quando não há login (demo). */
  loginUrl: string | null;
  /** Roda uma vez, logo depois de abrir o banco local. */
  prepare?(store: LocalStore): Promise<void>;
  /** Apaga os dados deste navegador e recoloca os iniciais (demo). */
  restore?(store: LocalStore): Promise<void>;
}
