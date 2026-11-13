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

/** Abre um PDF com os recursos empacotados (fontes padrão, cmaps, wasm), igual no leitor e nas capas. */
export async function openPdf(data: Uint8Array) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({
    data,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
  }).promise;
}
