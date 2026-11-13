// Corte das margens em branco: acha a área com conteúdo numa miniatura da página, para o leitor
// ampliar só o texto em telas estreitas. Puro (recebe os pixels), para os testes.

/** Área com conteúdo, em frações da página (0…1). */
export interface ContentBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Procura os pixels que diferem do fundo (a cor do canto superior esquerdo).
 * Devolve null quando não vale cortar: página vazia ou conteúdo ocupando quase tudo.
 * `pad` é a folga em volta do conteúdo, em fração da largura.
 */
export function findContentBox(data: Uint8ClampedArray, w: number, h: number, pad = 0.03): ContentBox | null {
  const [br, bg, bb] = [data[0], data[1], data[2]];
  // Diferença mínima do fundo: ignora ruído de compressão e sombras muito claras.
  const T = 40;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb) > T) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const px = pad * w;
  const box = {
    x0: Math.max(0, (x0 - px) / w),
    y0: Math.max(0, (y0 - px) / h),
    x1: Math.min(1, (x1 + 1 + px) / w),
    y1: Math.min(1, (y1 + 1 + px) / h),
  };
  // Cortar menos de 8% da largura não ajuda e só desloca a página.
  return box.x1 - box.x0 > 0.92 ? null : box;
}
