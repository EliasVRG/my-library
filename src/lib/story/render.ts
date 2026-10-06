// renderStory(model, data, theme) → Blob: desenha o story em Canvas 2D, no navegador e offline.
// As fontes são as mesmas do app (empacotadas pelo fontsource, no cache do PWA).

import { slugify } from "../export/backup";
import type { StoryData } from "./data";
import { layoutStory, STORY_H, STORY_W, type Op } from "./layout";
import type { StoryModel, StoryTheme } from "./palette";
import { canvasMeasurer, fontCss, type FontSpec } from "./text";

/** Todas as variações usadas pelos três modelos. */
const FONTS: FontSpec[] = [
  { family: "serif", size: 40 },
  { family: "serif", size: 40, italic: true },
  { family: "sans", size: 40, weight: 400 },
  { family: "sans", size: 40, weight: 500 },
  { family: "sans", size: 40, weight: 600 },
  { family: "mono", size: 40 },
];
// Inclui acentos e pontuação para carregar os subconjuntos (unicode-range) certos.
const SAMPLE = "AaÁáÂâÃãÇçÉéÍíÓóÔôÕõÚú—–…“”‘’★☆º0123456789";

let fontsReady: Promise<void> | null = null;
export function loadStoryFonts(): Promise<void> {
  fontsReady ??= Promise.all(FONTS.map((f) => document.fonts.load(fontCss(f), SAMPLE))).then(() => undefined);
  return fontsReady;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Navegadores sem `letterSpacing` no canvas (Safari antigo) recebem o espaçamento letra a letra. */
const hasLetterSpacing = (ctx: Ctx): boolean => typeof (ctx as { letterSpacing?: unknown }).letterSpacing === "string";

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: [number, number, number, number] = [0, 0, 0, 0]) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, [r[0], r[1], r[2], r[3]]);
}

function drawText(ctx: Ctx, op: Extract<Op, { k: "text" }>) {
  ctx.font = fontCss(op.font);
  ctx.fillStyle = op.fill;
  ctx.textBaseline = "alphabetic";
  const tracking = op.font.tracking ?? 0;
  if (hasLetterSpacing(ctx)) {
    ctx.letterSpacing = `${tracking}px`;
    ctx.textAlign = op.align ?? "left";
    ctx.fillText(op.text, op.x, op.y);
    return;
  }
  // Sem letterSpacing nativo: letra a letra.
  ctx.textAlign = "left";
  const chars = [...op.text];
  const width = chars.reduce((s, c) => s + ctx.measureText(c).width + tracking, 0);
  let x = op.align === "right" ? op.x - width : op.x;
  for (const c of chars) {
    ctx.fillText(c, x, op.y);
    x += ctx.measureText(c).width + tracking;
  }
}

function draw(ctx: Ctx, ops: Op[]) {
  for (const op of ops) {
    switch (op.k) {
      case "rect": {
        for (const s of op.shadows ?? []) {
          // CSS box-shadow com spread negativo: a forma que projeta a sombra encolhe; a capa a cobre depois.
          ctx.save();
          ctx.shadowColor = s.color;
          ctx.shadowBlur = s.blur;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = s.offsetY;
          ctx.fillStyle = op.fill;
          roundRect(ctx, op.x - s.spread, op.y - s.spread, op.w + 2 * s.spread, op.h + 2 * s.spread, op.radii);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = op.fill;
        roundRect(ctx, op.x, op.y, op.w, op.h, op.radii);
        ctx.fill();
        break;
      }
      case "hline":
        ctx.fillStyle = op.fill;
        ctx.fillRect(op.x, op.y, op.w, op.h);
        break;
      case "circle":
        ctx.beginPath();
        ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
        if (op.fill) {
          ctx.fillStyle = op.fill;
          ctx.fill();
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = op.lineWidth ?? 1;
          ctx.stroke();
        }
        break;
      case "text":
        drawText(ctx, op);
        break;
      case "group":
        ctx.save();
        if (op.rotate.deg) {
          ctx.translate(op.rotate.cx, op.rotate.cy);
          ctx.rotate((op.rotate.deg * Math.PI) / 180);
          ctx.translate(-op.rotate.cx, -op.rotate.cy);
        }
        if (op.clip) {
          roundRect(ctx, op.clip.x, op.clip.y, op.clip.w, op.clip.h, op.clip.radii);
          ctx.clip();
        }
        draw(ctx, op.ops);
        ctx.restore();
        break;
    }
  }
}

const MAX_PNG = 8 * 1024 * 1024;

function makeCanvas(): { ctx: Ctx; toBlob: (type: string, quality?: number) => Promise<Blob> } {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(STORY_W, STORY_H);
    const ctx = c.getContext("2d");
    if (ctx) return { ctx, toBlob: (type, quality) => c.convertToBlob({ type, quality }) };
  }
  const c = document.createElement("canvas");
  c.width = STORY_W;
  c.height = STORY_H;
  const ctx = c.getContext("2d")!;
  return {
    ctx,
    toBlob: (type, quality) =>
      new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas vazio"))), type, quality)),
  };
}

/** Gera o story em PNG 1080×1920 (JPEG de alta qualidade só se o PNG passar de 8 MB). */
export async function renderStory(model: StoryModel, data: StoryData, theme: StoryTheme): Promise<Blob> {
  await loadStoryFonts();
  const { ctx, toBlob } = makeCanvas();
  const layout = layoutStory(model, data, theme, canvasMeasurer(ctx));
  draw(ctx, layout.ops);
  const png = await toBlob("image/png");
  return png.size <= MAX_PNG ? png : toBlob("image/jpeg", 0.95);
}

export function storyFileName(title: string, blob: Blob): string {
  return `resenha-${slugify(title)}.${blob.type === "image/jpeg" ? "jpg" : "png"}`;
}
