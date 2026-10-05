// Carrega o pdf.js sob demanda (fica fora do pacote inicial) com o worker empacotado pelo Vite.

import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type Pdfjs = typeof import("pdfjs-dist");
let loading: Promise<Pdfjs> | null = null;

export function loadPdfjs(): Promise<Pdfjs> {
  loading ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  return loading;
}
