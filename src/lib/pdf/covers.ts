// Capas a partir do PDF: uma página vira uma JPEG pequena guardada no aparelho (IndexedDB).
// Só a escolha da página sincroniza (`cover_page`); a imagem é refeita em cada aparelho.

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Book } from "../../../shared/model";
import type { CoverImage } from "../db/idb";
import type { LocalStore } from "../db/repo";
import type { PdfFiles } from "./files";
import { openPdf } from "./pdfjs";

/** Largura da imagem: cobre a capa da grade (até ~220 px) em telas 2x sem pesar. */
const WIDTH = 440;

/** Página que o livro usa como capa; null = capa colorida (sem PDF ou escolhida pelo usuário). */
export function coverPage(book: Pick<Book, "pdf_key" | "cover_page">): number | null {
  if (!book.pdf_key || book.cover_page === 0) return null;
  return book.cover_page ?? 1;
}

/** A imagem guardada ainda vale? Vale se saiu do mesmo PDF e da mesma página. */
export function coverIsCurrent(book: Pick<Book, "pdf_key" | "cover_page">, img: Pick<CoverImage, "key" | "page"> | undefined): boolean {
  const page = coverPage(book);
  return page != null && !!img && img.key === book.pdf_key && img.page === page;
}

async function renderPage(doc: PDFDocumentProxy, n: number): Promise<Blob> {
  const page = await doc.getPage(Math.min(Math.max(1, n), doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: WIDTH / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext("2d")!;
  // Fundo branco: páginas sem fundo próprio ficariam pretas na JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport: vp }).promise;
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("capa vazia"))), "image/jpeg", 0.82));
}

export class Covers {
  /** book_id → URL da imagem atual. */
  private urls = new Map<string, { made: number; url: string }>();
  private queue: Promise<void> = Promise.resolve();
  private failed = new Set<string>();

  constructor(
    private readonly store: LocalStore,
    private readonly files: PdfFiles,
    /** Pode baixar o PDF só para fazer a capa? Só na demo (arquivos estáticos); em produção, nunca às escondidas. */
    private readonly fetchForCover = false,
  ) {}

  /** URLs das capas válidas para estes livros (reaproveita as já criadas, libera as que saíram). */
  async index(books: Book[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const keep = new Set<string>();
    const all = await this.store.db.getAll("covers");
    const byId = new Map(all.map((c) => [c.book_id, c]));
    for (const b of books) {
      const img = byId.get(b.id);
      if (!img || !coverIsCurrent(b, img)) continue;
      let u = this.urls.get(b.id);
      if (!u || u.made !== img.made_at) {
        if (u) URL.revokeObjectURL(u.url);
        u = { made: img.made_at, url: URL.createObjectURL(img.blob) };
        this.urls.set(b.id, u);
      }
      out.set(b.id, u.url);
      keep.add(b.id);
    }
    for (const [id, u] of this.urls) {
      if (!keep.has(id)) {
        URL.revokeObjectURL(u.url);
        this.urls.delete(id);
      }
    }
    return out;
  }

  /** Livros cuja capa falta ou ficou velha e cujo PDF está neste aparelho. */
  async missing(books: Book[], offline: Map<string, number>): Promise<Book[]> {
    const byId = new Map((await this.store.db.getAll("covers")).map((c) => [c.book_id, c]));
    return books.filter((b) => coverPage(b) != null && (offline.has(b.id) || (this.fetchForCover && b.pdf_ready_key === b.pdf_key)) && !this.failed.has(`${b.id}:${b.pdf_key}`) && !coverIsCurrent(b, byId.get(b.id)));
  }

  /**
   * Gera as capas que faltam, uma de cada vez (fila), a partir do PDF local.
   * Devolve quantas foram feitas; `onEach` avisa a cada capa nova.
   */
  generate(books: Book[], onEach: () => void): Promise<number> {
    const run = async () => {
      let made = 0;
      for (const b of books) {
        try {
          const blob = (await this.files.local(b))?.blob ?? (this.fetchForCover ? await this.files.download(b, { keep: false }) : null);
          if (!blob) continue;
          const doc = await openPdf(new Uint8Array(await blob.arrayBuffer()));
          try {
            await this.save(b, doc);
          } finally {
            void doc.loadingTask.destroy();
          }
          made++;
          onEach();
        } catch (e) {
          // PDF que não abre não fica tentando a cada atualização da estante.
          console.warn("capa", b.id, e);
          this.failed.add(`${b.id}:${b.pdf_key}`);
        }
      }
      return made;
    };
    const p = this.queue.then(run);
    this.queue = p.then(() => undefined, () => undefined);
    return p;
  }

  /** Gera a partir de um documento já aberto (o leitor), se a capa estiver faltando ou velha. */
  async fromOpenDoc(book: Book, doc: PDFDocumentProxy): Promise<boolean> {
    if (coverPage(book) == null) return false;
    if (coverIsCurrent(book, await this.store.db.get("covers", book.id))) return false;
    await this.save(book, doc);
    return true;
  }

  private async save(book: Book, doc: PDFDocumentProxy) {
    const page = coverPage(book)!;
    const blob = await renderPage(doc, page);
    await this.store.db.put("covers", { book_id: book.id, key: book.pdf_key!, page, blob, made_at: Date.now() });
  }
}
