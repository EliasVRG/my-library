// Tipos do motor de sincronização, separados para que a demo (que não tem motor) possa usá-los.

/**
 * Faz uma requisição à API. O caminho é relativo à raiz da API ("push", "changes?since=3"):
 * em produção vira /api/…; nos testes e na demo de sync, vai para um servidor em memória.
 */
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

/** O que a interface usa do motor. A demo implementa isto sem rede. */
export interface SyncController {
  status: SyncStatus;
  onStatus(fn: (s: SyncStatus) => void): () => void;
  start(): void;
  sync(): Promise<void>;
  retryNow(): Promise<void>;
}

export function idleStatus(): SyncStatus {
  return { state: "idle", pending: 0, pendingIds: new Set(), failed: 0, uploads: new Map(), lastSync: null, error: null };
}
