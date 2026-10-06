// Cores dos stories: as fórmulas de renderVals() dos modelos em docs/story-templates/.
// A cor de destaque é a da categoria do livro, nos valores claros dos tokens (--c1…--c6),
// que são os mesmos hexadecimais oferecidos nos mockups. tests/unit/story.test.ts confere
// que esta tabela não diverge de src/styles/tokens.css.

import { categoryIndex } from "../category";

export const CATEGORY_HEX = ["#3E6B5A", "#9A6236", "#4A5E9E", "#94506F", "#6E7A32", "#2F7686"] as const;
/** Livro sem categoria: o --faint claro, como a lombada na estante. */
export const NO_CATEGORY_HEX = "#A9A9A2";

export type StoryModel = "destaque" | "concordo" | "terminei";
export type StoryTheme = "light" | "dark";

export interface StoryPalette {
  /** Fundo da imagem. */
  canvas: string;
  /** Faixa tingida no topo (modelos 1 e 2); no modelo 3 é o próprio fundo. */
  tint: string;
  ink: string;
  muted: string;
  rule: string;
  coverBg: string;
  line: string;
  accentText: string;
}

export function accentFor(category: string): string {
  const i = categoryIndex(category);
  return i ? CATEGORY_HEX[i - 1] : NO_CATEGORY_HEX;
}

function rgb(hex: string): [number, number, number] {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  let n = parseInt(h, 16);
  if (Number.isNaN(n)) n = 0x4a5e9e;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** mix(a, b, t) = a·t + b·(1−t), como no mockup. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return "#" + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, "0")).join("");
}

export function paletteFor(model: StoryModel, accent: string, theme: StoryTheme): StoryPalette {
  const dark = theme === "dark";
  const bg = dark ? "#111111" : "#F8F8F6";
  const ink = dark ? "#EDEDEA" : "#151515";
  if (model === "terminei") {
    const tint = mix(accent, bg, dark ? 0.3 : 0.26);
    return {
      canvas: tint,
      tint,
      ink,
      muted: dark ? "#B0B0A9" : "#4F4F4A",
      rule: mix(accent, bg, dark ? 0.75 : 0.6),
      coverBg: dark ? mix(accent, "#1A1A19", 0.45) : mix(accent, "#FFFFFF", 0.14),
      line: mix(accent, bg, dark ? 0.75 : 0.6),
      accentText: dark ? mix(accent, "#FFFFFF", 0.55) : mix(accent, "#000000", 0.8),
    };
  }
  return {
    canvas: bg,
    tint: mix(accent, bg, dark ? 0.24 : 0.16),
    ink,
    muted: dark ? "#A3A39C" : "#5E5E58",
    rule: dark ? "#2E2E2B" : "#DDDDD7",
    coverBg: dark ? mix(accent, "#1A1A19", 0.38) : mix(accent, "#FFFFFF", 0.24),
    line: mix(accent, bg, dark ? 0.7 : 0.45),
    accentText: dark ? mix(accent, "#FFFFFF", 0.55) : mix(accent, "#000000", 0.85),
  };
}
