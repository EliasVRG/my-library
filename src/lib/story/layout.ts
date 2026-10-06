// Layout dos três stories: reproduz o flexbox dos mockups (docs/story-templates/) com
// coordenadas absolutas e devolve uma lista de operações de desenho. Puro: as medidas
// vêm de um Measurer, então dá para testar sem canvas.

import type { StoryData } from "./data";
import { paletteFor, type StoryModel, type StoryPalette, type StoryTheme } from "./palette";
import { baselineOffset, clampLines, fitText, lineHeightPx, wrap, type FitResult, type FontSpec, type Measurer } from "./text";

export const STORY_W = 1080;
export const STORY_H = 1920;
/** Área segura do story: nada importante nos 250 px do topo nem nos 340 px da base. */
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = STORY_H - 340;
const PAD_X = 96;
const CONTENT_W = STORY_W - 2 * PAD_X;
const SHADOW_INK = "rgba(0,0,0,0.45)";

export interface Shadow {
  color: string;
  blur: number;
  offsetY: number;
  /** CSS spread (negativo encolhe a sombra). */
  spread: number;
}

export type Op =
  | { k: "rect"; x: number; y: number; w: number; h: number; fill: string; radii?: [number, number, number, number]; shadows?: Shadow[] }
  | { k: "text"; x: number; y: number; text: string; font: FontSpec; fill: string; align?: "left" | "right" }
  | { k: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; lineWidth?: number }
  | { k: "hline"; x: number; y: number; w: number; h: number; fill: string }
  | { k: "group"; rotate: { cx: number; cy: number; deg: number }; clip?: { x: number; y: number; w: number; h: number; radii: [number, number, number, number] }; ops: Op[] };

export interface StoryLayout {
  ops: Op[];
  palette: StoryPalette;
  /** Ajustes feitos nos textos (para testes e para a interface avisar de cortes). */
  fits: Record<string, FitResult>;
  /** Menor y de conteúdo e maior y de conteúdo (para conferir a área segura). */
  bounds: { top: number; bottom: number };
}

const upper = (s: string) => s.toLocaleUpperCase("pt-BR");
const em = (size: number, e: number) => size * e;
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

class Builder {
  ops: Op[] = [];
  fits: Record<string, FitResult> = {};
  top = Infinity;
  bottom = -Infinity;
  constructor(readonly m: Measurer) {}

  mark(y0: number, y1: number) {
    this.top = Math.min(this.top, y0);
    this.bottom = Math.max(this.bottom, y1);
  }

  /** Linhas de texto a partir do topo da caixa; devolve a altura ocupada. */
  lines(lines: string[], font: FontSpec, x: number, top: number, fill: string, lineHeight?: number, align: "left" | "right" = "left", target = this.ops): number {
    const lh = lineHeightPx(this.m, font, lineHeight);
    const base = baselineOffset(this.m, font, lineHeight);
    lines.forEach((text, i) => target.push({ k: "text", x, y: top + i * lh + base, text, font, fill, align }));
    this.mark(top, top + lines.length * lh);
    return lines.length * lh;
  }

  fit(key: string, r: FitResult) {
    this.fits[key] = r;
    return r;
  }
}

// ---------- capa ----------

interface CoverSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  pad: [number, number];
  radii: [number, number, number, number];
  inset: number;
  shadows: Shadow[];
}

/** Capa grande (400×600) dos modelos 1 e 3: categoria, título e autor, como na estante. */
function bigCover(b: Builder, d: StoryData, p: StoryPalette, x: number, y: number, rotate = 0) {
  const spec: CoverSpec = {
    x,
    y,
    w: 400,
    h: 600,
    pad: [34, 30],
    radii: [8, 16, 16, 8],
    inset: 8,
    shadows: [
      { color: "rgba(0,0,0,0.08)", blur: 4, offsetY: 2, spread: 0 },
      { color: rotate ? "rgba(0,0,0,0.5)" : SHADOW_INK, blur: rotate ? 80 : 70, offsetY: rotate ? 50 : 40, spread: -30 },
    ],
  };
  const inner: Op[] = [];
  const innerW = spec.w - 2 * spec.pad[1];
  const innerH = spec.h - 2 * spec.pad[0];
  const left = x + spec.pad[1];

  const catFont: FontSpec = { family: "sans", size: 20, weight: 600, tracking: em(20, 0.12) };
  const catLines = d.category ? clampLines(wrap(upper(d.category), innerW, catFont, b.m), 1, innerW, catFont, b.m) : [];
  const catH = catLines.length ? lineHeightPx(b.m, catFont) : 0;

  const authorFont: FontSpec = { family: "sans", size: 22 };
  const authorLines = d.author ? clampLines(wrap(d.author, innerW, authorFont, b.m), 2, innerW, authorFont, b.m) : [];
  const authorH = authorLines.length ? 2 + 16 + authorLines.length * lineHeightPx(b.m, authorFont) : 0;

  const title = b.fit("coverTitle", fitText({ text: d.title, font: { family: "serif" }, max: 62, min: 34, lineHeight: 1.02, maxWidth: innerW, maxHeight: innerH - catH - authorH - 32 }, b.m));

  // justify-content: space-between com três itens: o título fica no meio do espaço livre.
  const top = y + spec.pad[0];
  const free = innerH - catH - title.height - authorH;
  const cat = catLines.length ? 1 : 0;
  const auth = authorLines.length ? 1 : 0;
  const titleTop = cat && auth ? top + catH + free / 2 : cat ? top + innerH - title.height : auth ? top : top + free / 2;

  if (catLines.length) b.lines(catLines, catFont, left, top, p.accentText, undefined, "left", inner);
  b.lines(title.lines, title.font, left, titleTop, p.ink, 1.02, "left", inner);
  if (authorLines.length) {
    const aTop = top + innerH - authorH;
    inner.push({ k: "hline", x: left, y: aTop, w: innerW, h: 2, fill: p.line });
    b.lines(authorLines, authorFont, left, aTop + 2 + 16, p.muted, undefined, "left", inner);
  }
  return coverOps(spec, p, inner, rotate);
}

/** Capa pequena (150×225) do modelo 2: só o título, alinhado embaixo. */
function smallCover(b: Builder, d: StoryData, p: StoryPalette, x: number, y: number) {
  const spec: CoverSpec = {
    x,
    y,
    w: 150,
    h: 225,
    pad: [16, 14],
    radii: [4, 8, 8, 4],
    inset: 5,
    shadows: [{ color: SHADOW_INK, blur: 40, offsetY: 20, spread: -20 }],
  };
  const innerW = spec.w - 2 * spec.pad[1];
  const innerH = spec.h - 2 * spec.pad[0];
  const t = b.fit("smallCoverTitle", fitText({ text: d.title, font: { family: "serif" }, max: 26, min: 16, lineHeight: 1.02, maxWidth: innerW, maxHeight: innerH }, b.m));
  const inner: Op[] = [];
  b.lines(t.lines, t.font, x + spec.pad[1], y + spec.h - spec.pad[0] - t.height, p.ink, 1.02, "left", inner);
  return coverOps(spec, p, inner, 0);
}

function coverOps(s: CoverSpec, p: StoryPalette, inner: Op[], rotate: number): Op[] {
  const body: Op[] = [
    { k: "rect", x: s.x, y: s.y, w: s.w, h: s.h, fill: p.coverBg, radii: s.radii, shadows: s.shadows },
    {
      k: "group",
      rotate: { cx: 0, cy: 0, deg: 0 },
      clip: { x: s.x, y: s.y, w: s.w, h: s.h, radii: s.radii },
      ops: [{ k: "rect", x: s.x, y: s.y, w: s.inset, h: s.h, fill: p.line }, ...inner],
    },
  ];
  if (!rotate) return body;
  return [{ k: "group", rotate: { cx: s.x + s.w / 2, cy: s.y + s.h / 2, deg: rotate }, ops: body }];
}

// ---------- pedaços comuns ----------

const monoLabel = (size: number): FontSpec => ({ family: "mono", size, tracking: em(size, 0.12) });

/** Cabeçalho em mono maiúsculo com dois lados. */
function headerRow(b: Builder, y: number, left: string, right: string | null, fill: string) {
  const f = monoLabel(26);
  const h = lineHeightPx(b.m, f);
  b.lines([upper(left)], f, PAD_X, y, fill);
  // O CSS soma o letter-spacing depois da última letra: o texto alinhado à direita "recua" esse tanto.
  if (right) b.lines([upper(right)], f, PAD_X + CONTENT_W - (f.tracking ?? 0), y, fill, undefined, "right");
  return h;
}

function handleWidth(b: Builder, d: StoryData) {
  return d.handle ? b.m.width(d.handle, { family: "sans", size: 28, weight: 500 }) : 0;
}

// ---------- modelo 1: nota e destaque ----------

function layoutDestaque(b: Builder, d: StoryData, p: StoryPalette) {
  b.ops.push({ k: "rect", x: 0, y: 0, w: STORY_W, h: STORY_H, fill: p.canvas });
  b.ops.push({ k: "rect", x: 0, y: 0, w: STORY_W, h: 1010, fill: p.tint });
  const GAP = 72;
  let y = SAFE_TOP;
  y += headerRow(b, y, "Resenha", "Estante de Leitura", p.muted) + GAP;

  // Linha da capa + informações, alinhadas pela base.
  const rowTop = y;
  const COVER = 600;
  const infoX = PAD_X + 400 + 52;
  const infoW = CONTENT_W - 400 - 52;
  const authorFont: FontSpec = { family: "sans", size: 32 };
  const authorLines = d.author ? clampLines(wrap(d.author, infoW, authorFont, b.m), 2, infoW, authorFont, b.m) : [];
  const authorH = authorLines.length * lineHeightPx(b.m, authorFont);
  const starsFont: FontSpec = { family: "sans", size: 52, tracking: 6 };
  const starsH = d.rating ? 12 + lineHeightPx(b.m, starsFont) : 0;
  const gaps = (authorLines.length ? 20 : 0) + (d.rating ? 20 : 0);
  const title = b.fit("title", fitText({ text: d.title, font: { family: "serif", tracking: -0.92 }, trackingEm: -0.01, max: 92, min: 56, lineHeight: 0.98, maxWidth: infoW, maxHeight: COVER - 8 - authorH - starsH - gaps }, b.m));
  const infoH = title.height + authorH + starsH + gaps + 8;
  const rowH = Math.max(COVER, infoH);
  b.ops.push(...bigCover(b, d, p, PAD_X, rowTop + rowH - COVER));
  let iy = rowTop + rowH - infoH;
  iy += b.lines(title.lines, title.font, infoX, iy, p.ink, 0.98);
  if (authorLines.length) iy += 20 + b.lines(authorLines, authorFont, infoX, iy + 20, p.muted);
  if (d.rating) b.lines([stars(d.rating)], starsFont, infoX, iy + 20 + 12, p.ink);
  b.mark(rowTop, rowTop + rowH);
  y = rowTop + rowH + GAP;

  // Rodapé (margin-top: auto): páginas · dias à esquerda, @ à direita.
  const stats: [string, string][] = [];
  if (d.pages) stats.push([String(d.pages), " págs"]);
  if (d.days) stats.push([String(d.days), d.days === 1 ? " dia" : " dias"]);
  const statFont: FontSpec = { family: "mono", size: 28 };
  const handleFont: FontSpec = { family: "sans", size: 28, weight: 500 };
  const hasFooter = stats.length > 0 || !!d.handle;
  const lineH = Math.max(stats.length ? lineHeightPx(b.m, statFont) : 0, d.handle ? lineHeightPx(b.m, handleFont) : 0);
  const footerH = hasFooter ? 2 + 32 + lineH : 0;
  const footerTop = SAFE_BOTTOM - footerH;

  // Trecho em destaque: ocupa o espaço que sobrar.
  if (d.highlight) {
    const markFont: FontSpec = { family: "serif", size: 160 };
    // A aspa tem caixa de 60 px e line-height 0.5: o glifo transborda para cima, como no mockup.
    b.ops.push({ k: "text", x: PAD_X, y: y + baselineOffset(b.m, markFont, 0.5), text: "“", font: markFont, fill: p.accentText });
    b.mark(y, y + 60);
    const paraTop = y + 60 + 28;
    const maxH = (hasFooter ? footerTop - GAP : SAFE_BOTTOM) - paraTop;
    const q = b.fit("highlight", fitText({ text: d.highlight, font: { family: "serif", italic: true }, trackingEm: -0.005, max: 76, min: 56, lineHeight: 1.08, maxWidth: CONTENT_W, maxHeight: maxH }, b.m));
    b.lines(q.lines, q.font, PAD_X, paraTop, p.ink, 1.08);
  }

  if (hasFooter) {
    b.ops.push({ k: "hline", x: PAD_X, y: footerTop, w: CONTENT_W, h: 2, fill: p.rule });
    const rowTop2 = footerTop + 2 + 32;
    // align-items: flex-end: as bases das caixas coincidem.
    let sx = PAD_X;
    for (const [num, label] of stats) {
      const top = rowTop2 + lineH - lineHeightPx(b.m, statFont);
      b.lines([num], statFont, sx, top, p.ink);
      const nw = b.m.width(num, statFont);
      b.lines([label], statFont, sx + nw, top, p.muted);
      sx += nw + b.m.width(label, statFont) + 48;
    }
    if (d.handle) b.lines([d.handle], handleFont, PAD_X + CONTENT_W, rowTop2 + lineH - lineHeightPx(b.m, handleFont), p.ink, undefined, "right");
    b.mark(footerTop, SAFE_BOTTOM);
  }
}

// ---------- modelo 2: concordo e discordo ----------

interface DebateField {
  key: "concordo" | "discordo" | "outroLado";
  label: string;
  text: string;
}

function layoutConcordo(b: Builder, d: StoryData, p: StoryPalette) {
  b.ops.push({ k: "rect", x: 0, y: 0, w: STORY_W, h: STORY_H, fill: p.canvas });
  b.ops.push({ k: "rect", x: 0, y: 0, w: STORY_W, h: 640, fill: p.tint });
  const GAP = 64;
  let y = SAFE_TOP;
  y += headerRow(b, y, "Resenha", d.rating ? stars(d.rating) : null, p.muted) + GAP;

  // Capa pequena + título, centralizados na vertical.
  const infoX = PAD_X + 150 + 40;
  const infoW = CONTENT_W - 150 - 40;
  const authorFont: FontSpec = { family: "sans", size: 30 };
  const authorLines = d.author ? clampLines(wrap(d.author, infoW, authorFont, b.m), 2, infoW, authorFont, b.m) : [];
  const authorH = authorLines.length * lineHeightPx(b.m, authorFont);
  const title = b.fit("title", fitText({ text: d.title, font: { family: "serif" }, max: 76, min: 48, lineHeight: 0.98, maxWidth: infoW, maxHeight: 3 * 76 * 0.98 }, b.m));
  const infoH = title.height + (authorLines.length ? 10 + authorH : 0);
  const rowH = Math.max(225, infoH);
  b.ops.push(...smallCover(b, d, p, PAD_X, y + (rowH - 225) / 2));
  let iy = y + (rowH - infoH) / 2;
  iy += b.lines(title.lines, title.font, infoX, iy, p.ink, 0.98);
  if (authorLines.length) b.lines(authorLines, authorFont, infoX, iy + 10, p.muted);
  b.mark(y, y + rowH);
  y += rowH + GAP;

  // Rodapé.
  const footFont: FontSpec = { family: "sans", size: 28 };
  const handleFont: FontSpec = { family: "sans", size: 28, weight: 500 };
  const footH = lineHeightPx(b.m, footFont);
  const footTop = SAFE_BOTTOM - footH;
  b.lines(["Estante de Leitura"], footFont, PAD_X, footTop, p.muted);
  if (d.handle) b.lines([d.handle], handleFont, PAD_X + CONTENT_W, footTop + (footH - lineHeightPx(b.m, handleFont)) / 2, p.ink, undefined, "right");

  // Campos: só os preenchidos.
  const fields: DebateField[] = [
    { key: "concordo" as const, label: "Onde concordo", text: d.concordo ?? "" },
    { key: "discordo" as const, label: "Onde discordo", text: d.discordo ?? "" },
    { key: "outroLado" as const, label: "O outro lado diria", text: d.outroLado ?? "" },
  ].filter((f) => f.text);
  const avail = footTop - GAP - y;
  const labelFont = monoLabel(24);
  const labelH = Math.max(lineHeightPx(b.m, labelFont), 18);
  const fixed = (f: DebateField, i: number) => (i ? 56 : 0) + (f.key === "outroLado" ? 2 + 40 : 0) + labelH + 18;
  const fixedTotal = fields.reduce((s, f, i) => s + fixed(f, i), 0);

  const sizeFor = (f: DebateField, main: number) => (f.key === "outroLado" ? Math.round((main * 50) / 58) : main);
  const lhFor = (f: DebateField) => (f.key === "outroLado" ? 1.12 : 1.1);
  const fontFor = (f: DebateField, size: number): FontSpec => ({ family: "serif", size, italic: f.key === "outroLado" });
  let main = 58;
  let wrapped: string[][] = [];
  const measure = (size: number) => {
    wrapped = fields.map((f) => wrap(f.text, CONTENT_W, fontFor(f, sizeFor(f, size)), b.m));
    return fields.reduce((s, f, i) => s + wrapped[i].length * sizeFor(f, size) * lhFor(f), 0);
  };
  while (main > 44 && fixedTotal + measure(main) > avail) main -= 2;
  let used = fixedTotal + measure(main);
  // No mínimo e ainda sem caber: tira linhas do campo mais longo, com reticências no fim.
  const counts = wrapped.map((w) => w.length);
  while (used > avail && counts.some((c) => c > 1)) {
    const i = counts.indexOf(Math.max(...counts));
    counts[i]--;
    used -= sizeFor(fields[i], main) * lhFor(fields[i]);
  }

  fields.forEach((f, i) => {
    if (i) y += 56;
    const color = f.key === "concordo" ? p.accentText : f.key === "discordo" ? p.ink : p.muted;
    if (f.key === "outroLado") {
      b.ops.push({ k: "hline", x: PAD_X, y, w: CONTENT_W, h: 2, fill: p.rule });
      y += 2 + 40;
    }
    const labelTop = y + (labelH - lineHeightPx(b.m, labelFont)) / 2;
    let lx = PAD_X;
    if (f.key !== "outroLado") {
      const cy = y + labelH / 2;
      b.ops.push(f.key === "concordo" ? { k: "circle", cx: PAD_X + 9, cy, r: 9, fill: color } : { k: "circle", cx: PAD_X + 9, cy, r: 8, stroke: color, lineWidth: 2 });
      lx += 18 + 16;
    }
    b.lines([upper(f.label)], labelFont, lx, labelTop, color);
    y += labelH + 18;
    const font = fontFor(f, sizeFor(f, main));
    const lines = clampLines(wrapped[i], counts[i], CONTENT_W, font, b.m);
    b.fits[f.key] = { font, lines, lineHeight: font.size * lhFor(f), height: lines.length * font.size * lhFor(f), truncated: lines.length < wrapped[i].length };
    y += b.lines(lines, font, PAD_X, y, f.key === "outroLado" ? p.muted : p.ink, lhFor(f));
  });
  b.mark(footTop, SAFE_BOTTOM);
}

// ---------- modelo 3: terminei de ler ----------

function layoutTerminei(b: Builder, d: StoryData, p: StoryPalette) {
  b.ops.push({ k: "rect", x: 0, y: 0, w: STORY_W, h: STORY_H, fill: p.canvas });
  const GAP = 64;
  let y = SAFE_TOP;
  if (d.yearLine) {
    const f = monoLabel(26);
    y += b.lines([upper(d.yearLine)], f, PAD_X, y, p.accentText) + 8;
  }
  const big: FontSpec = { family: "serif", size: 210, tracking: em(210, -0.02) };
  b.lines(["Terminei"], big, PAD_X, y, p.ink, 0.95);
  const dot: FontSpec = { ...big, italic: true };
  b.lines(["."], dot, PAD_X + b.m.width("Terminei", big), y, p.accentText, 0.95);
  y += 210 * 0.95 + GAP;

  // Capa inclinada + informações, centralizadas na vertical.
  const COVER = 600;
  const infoX = PAD_X + 400 + 52;
  const infoW = CONTENT_W - 400 - 52;
  const authorFont: FontSpec = { family: "sans", size: 30 };
  const authorLines = d.author ? clampLines(wrap(d.author, infoW, authorFont, b.m), 2, infoW, authorFont, b.m) : [];
  const authorH = authorLines.length * lineHeightPx(b.m, authorFont);
  const starsFont: FontSpec = { family: "sans", size: 48, tracking: 6 };
  const starsH = d.rating ? 8 + lineHeightPx(b.m, starsFont) : 0;
  const gaps = (authorLines.length ? 18 : 0) + (d.rating ? 18 : 0);
  const title = b.fit("title", fitText({ text: d.title, font: { family: "serif" }, max: 72, min: 48, lineHeight: 1, maxWidth: infoW, maxHeight: COVER - authorH - starsH - gaps }, b.m));
  const infoH = title.height + authorH + starsH + gaps;
  const rowH = Math.max(COVER, infoH);
  b.ops.push(...bigCover(b, d, p, PAD_X, y + (rowH - COVER) / 2, -3));
  let iy = y + (rowH - infoH) / 2;
  iy += b.lines(title.lines, title.font, infoX, iy, p.ink, 1);
  if (authorLines.length) iy += 18 + b.lines(authorLines, authorFont, infoX, iy + 18, p.muted);
  if (d.rating) b.lines([stars(d.rating)], starsFont, infoX, iy + 18 + 8, p.ink);
  b.mark(y, y + rowH);
  y += rowH + GAP;

  // Números: páginas, dias, nota (os que existirem, em colunas da esquerda para a direita).
  const cells: [string, string][] = [];
  if (d.pages) cells.push([String(d.pages), "páginas"]);
  if (d.days) cells.push([String(d.days), d.days === 1 ? "dia" : "dias"]);
  if (d.rating) cells.push([`${d.rating}/5`, "nota"]);
  if (cells.length) {
    b.ops.push({ k: "hline", x: PAD_X, y, w: CONTENT_W, h: 2, fill: p.line });
    const top = y + 2 + 36;
    const colW = (CONTENT_W - 2 * 32) / 3;
    const valFont: FontSpec = { family: "mono", size: 72 };
    const labFont: FontSpec = { family: "sans", size: 26 };
    let h = 0;
    cells.forEach(([v, l], i) => {
      const x = PAD_X + i * (colW + 32);
      const vh = b.lines([v], valFont, x, top, p.ink, 1);
      h = Math.max(h, vh + 6 + b.lines([l], labFont, x, top + vh + 6, p.muted));
    });
    y = top + h + GAP;
  }

  // Rodapé: próxima leitura à esquerda, @ à direita (alinhados pela base).
  const handleFont: FontSpec = { family: "sans", size: 28, weight: 500 };
  const handleH = d.handle ? lineHeightPx(b.m, handleFont) : 0;
  if (d.handle) b.lines([d.handle], handleFont, PAD_X + CONTENT_W, SAFE_BOTTOM - handleH, p.ink, undefined, "right");
  if (d.next) {
    const labFont: FontSpec = { family: "sans", size: 24 };
    const labH = lineHeightPx(b.m, labFont);
    const maxW = CONTENT_W - (d.handle ? handleWidth(b, d) + 24 : 0);
    const maxH = Math.min(2 * 44 * 1.05, SAFE_BOTTOM - y - labH - 6);
    const t = b.fit("next", fitText({ text: d.next, font: { family: "serif" }, max: 44, min: 32, lineHeight: 1.05, maxWidth: maxW, maxHeight: maxH, maxLines: 2 }, b.m));
    const top = SAFE_BOTTOM - t.height - 6 - labH;
    b.lines(["Próxima leitura"], labFont, PAD_X, top, p.muted);
    b.lines(t.lines, t.font, PAD_X, top + labH + 6, p.ink, 1.05);
  }
}

export function layoutStory(model: StoryModel, data: StoryData, theme: StoryTheme, m: Measurer): StoryLayout {
  const palette = paletteFor(model, data.accent, theme);
  const b = new Builder(m);
  if (model === "destaque") layoutDestaque(b, data, palette);
  else if (model === "concordo") layoutConcordo(b, data, palette);
  else layoutTerminei(b, data, palette);
  return { ops: b.ops, palette, fits: b.fits, bounds: { top: b.top, bottom: b.bottom } };
}
