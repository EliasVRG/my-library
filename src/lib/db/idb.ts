import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Book, FieldClock, Review, Table } from "../../../shared/model";

export interface PdfFile {
  book_id: string;
  /** Chave do R2 a que este arquivo corresponde. Se o livro trocar de PDF, a cópia fica obsoleta. */
  key: string;
  blob: Blob;
  size: number;
  file_name: string;
  saved_at: number;
  accessed_at: number;
}

export interface RecordItem {
  id: string; // `${table}:${rid}`
  kind: "record";
  table: Table;
  rid: string;
  fields: Record<string, unknown>;
  clock: FieldClock;
  created_at?: number;
  attempts: number;
  next_at: number;
  /** Rejeitado pelo servidor (400). Não é reenviado até ser editado de novo. */
  failed?: string;
}

export interface UploadPart {
  partNumber: number;
  etag: string;
}

export interface UploadItem {
  id: string; // `upload:${book_id}`
  kind: "upload";
  book_id: string;
  key: string;
  upload_id: string | null;
  parts: UploadPart[];
  attempts: number;
  next_at: number;
  failed?: string;
}

export type OutboxItem = RecordItem | UploadItem;

/** Capa gerada de uma página do PDF. Só neste aparelho; refeita se o PDF ou a página mudar. */
export interface CoverImage {
  book_id: string;
  /** `pdf_key` do PDF de onde saiu. */
  key: string;
  page: number;
  blob: Blob;
  made_at: number;
}

export interface EstanteSchema extends DBSchema {
  books: { key: string; value: Book };
  reviews: { key: string; value: Review };
  pdfs: { key: string; value: PdfFile };
  covers: { key: string; value: CoverImage };
  outbox: { key: string; value: OutboxItem };
  meta: { key: string; value: unknown };
}

export type EstanteDB = IDBPDatabase<EstanteSchema>;

export function openEstanteDb(name = "estante"): Promise<EstanteDB> {
  return openDB<EstanteSchema>(name, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("books", { keyPath: "id" });
        db.createObjectStore("reviews", { keyPath: "book_id" });
        db.createObjectStore("pdfs", { keyPath: "book_id" });
        db.createObjectStore("outbox", { keyPath: "id" });
        db.createObjectStore("meta");
      }
      // v2: capas geradas do PDF.
      if (oldVersion < 2) db.createObjectStore("covers", { keyPath: "book_id" });
    },
  });
}

export const recordItemId = (table: Table, rid: string) => `${table}:${rid}`;
export const uploadItemId = (bookId: string) => `upload:${bookId}`;
