// Texto dos stories: fontes, quebra de linha e ajuste de tamanho.
// Tudo recebe um `Measurer`, para os testes usarem medidas falsas e o canvas, as reais.

export type Family = "serif" | "sans" | "mono";

export interface FontSpec {
  family: Family;
  size: number;
  weight?: 400 | 500 | 600;
  italic?: boolean;
  /** Espaçamento entre letras em px (CSS letter-spacing). */
  tracking?: number;
}

/** Nomes das famílias como o @font-face do app as registra (fontsource), com os mesmos fallbacks do mockup. */
export const FAMILY_CSS: Record<Family, string> = {
  serif: '"Instrument Serif", Georgia, serif',
  sans: '"Geist Variable", system-ui, sans-serif',
  mono: '"Geist Mono Variable", ui-monospace, monospace',
};

export function fontCss(f: FontSpec): string {
  return `${f.italic ? "italic " : ""}${f.weight ?? 400} ${f.size}px ${FAMILY_CSS[f.family]}`;
}

export interface Measurer {
  /** Largura do texto já com o letter-spacing da fonte. */
  width(text: string, font: FontSpec): number;
  /** Ascendente e descendente da fonte (fontBoundingBox), em px. */
  metrics(font: FontSpec): { ascent: number; descent: number };
}

/** Altura de uma linha: fator de line-height do CSS, ou `normal` (ascendente + descendente). */
export function lineHeightPx(m: Measurer, font: FontSpec, lineHeight?: number): number {
  if (lineHeight) return font.size * lineHeight;
  const { ascent, descent } = m.metrics(font);
  return ascent + descent;
}

/** Distância do topo da caixa da linha até a linha de base, como o CSS centraliza o texto na linha. */
export function baselineOffset(m: Measurer, font: FontSpec, lineHeight?: number): number {
  const { ascent, descent } = m.metrics(font);
  return (lineHeightPx(m, font, lineHeight) - (ascent + descent)) / 2 + ascent;
}

/** Junta espaços, quebras de linha e tabs num espaço só. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Quebra em linhas que cabem em `maxWidth`. Palavra maior que a linha é quebrada por caractere. */
export function wrap(text: string, maxWidth: number, font: FontSpec, m: Measurer): string[] {
  const words = normalize(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (m.width(candidate, font) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (m.width(word, font) <= maxWidth) {
      line = word;
      continue;
    }
    // Palavra sozinha não cabe: corta por caractere.
    let piece = "";
    for (const ch of word) {
      if (piece && m.width(piece + ch, font) > maxWidth) {
        lines.push(piece);
        piece = ch;
      } else piece += ch;
    }
    line = piece;
  }
  if (line) lines.push(line);
  return lines;
}

const ELLIPSIS = "…";

/** Mantém `maxLines` linhas; a última termina em reticências e ainda cabe na largura. */
export function clampLines(lines: string[], maxLines: number, maxWidth: number, font: FontSpec, m: Measurer): string[] {
  if (lines.length <= maxLines) return lines;
  if (maxLines <= 0) return [];
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && m.width(last + ELLIPSIS, font) > maxWidth) {
    const cut = last.lastIndexOf(" ");
    last = cut > 0 ? last.slice(0, cut) : last.slice(0, -1);
  }
  kept[maxLines - 1] = last.replace(/[\s,.;:—–-]+$/, "") + ELLIPSIS;
  return kept;
}

export interface FitOptions {
  text: string;
  font: Omit<FontSpec, "size">;
  /** Tamanho inicial e mínimo legível, em px; desce de `step` em `step`. */
  max: number;
  min: number;
  step?: number;
  /** Fator de line-height do CSS (ex.: 1.08). Sem ele, `normal`. */
  lineHeight?: number;
  maxWidth: number;
  maxHeight: number;
  /** Limite extra de linhas (ex.: título da capa pequena). */
  maxLines?: number;
  /** Escala o letter-spacing junto com a fonte (em em). */
  trackingEm?: number;
}

export interface FitResult {
  font: FontSpec;
  lines: string[];
  lineHeight: number;
  height: number;
  /** Teve de cortar com reticências mesmo no tamanho mínimo. */
  truncated: boolean;
}

/**
 * Maior tamanho (de `max` até `min`) em que o texto inteiro cabe na caixa.
 * Se nem o mínimo couber, usa o mínimo e corta com reticências no fim de uma linha.
 */
export function fitText(o: FitOptions, m: Measurer): FitResult {
  const step = o.step ?? 2;
  const build = (size: number): FitResult => {
    const font: FontSpec = { ...o.font, size, tracking: o.trackingEm != null ? o.trackingEm * size : o.font.tracking };
    const lh = lineHeightPx(m, font, o.lineHeight);
    const lines = wrap(o.text, o.maxWidth, font, m);
    return { font, lines, lineHeight: lh, height: lines.length * lh, truncated: false };
  };
  const fits = (r: FitResult) => r.height <= o.maxHeight + 0.5 && (o.maxLines == null || r.lines.length <= o.maxLines);
  for (let size = o.max; size >= o.min; size -= step) {
    const r = build(size);
    if (fits(r)) return r;
  }
  const r = build(o.min);
  const byHeight = Math.max(1, Math.floor((o.maxHeight + 0.5) / r.lineHeight));
  const maxLines = Math.min(byHeight, o.maxLines ?? Infinity);
  const lines = clampLines(r.lines, maxLines, o.maxWidth, r.font, m);
  return { ...r, lines, height: lines.length * r.lineHeight, truncated: lines.length < r.lines.length };
}

/** Medidor de verdade, sobre um contexto 2D. */
export function canvasMeasurer(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): Measurer {
  const cache = new Map<string, { ascent: number; descent: number }>();
  const supportsTracking = typeof (ctx as { letterSpacing?: unknown }).letterSpacing === "string";
  const apply = (f: FontSpec) => {
    ctx.font = fontCss(f);
    if (supportsTracking) ctx.letterSpacing = `${f.tracking ?? 0}px`;
  };
  return {
    width(text, f) {
      apply(f);
      const w = ctx.measureText(text).width;
      // Sem suporte nativo, o desenho põe o espaçamento letra a letra; a medida acompanha.
      return supportsTracking ? w : w + (f.tracking ?? 0) * [...text].length;
    },
    metrics(f) {
      const key = fontCss({ ...f, tracking: 0 });
      let v = cache.get(key);
      if (!v) {
        apply({ ...f, tracking: 0 });
        const mt = ctx.measureText("Hg");
        v = { ascent: mt.fontBoundingBoxAscent, descent: mt.fontBoundingBoxDescent };
        cache.set(key, v);
      }
      return v;
    },
  };
}
