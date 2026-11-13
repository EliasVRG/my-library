import { describe, expect, it } from "vitest";
import { findContentBox } from "../../src/lib/pdf/crop";

/** Página w×h com fundo `bg` e um retângulo de "texto" preto. */
function page(w: number, h: number, rect: [number, number, number, number] | null, bg = 255) {
  const d = new Uint8ClampedArray(w * h * 4).fill(bg);
  if (rect) {
    const [rx0, ry0, rx1, ry1] = rect;
    for (let y = ry0; y < ry1; y++)
      for (let x = rx0; x < rx1; x++) {
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 20;
      }
  }
  return d;
}

describe("findContentBox", () => {
  it("acha o texto no meio de margens largas, com folga", () => {
    const b = findContentBox(page(100, 150, [25, 30, 75, 120]), 100, 150, 0)!;
    expect(b).toEqual({ x0: 0.25, y0: 0.2, x1: 0.75, y1: 0.8 });
    const padded = findContentBox(page(100, 150, [25, 30, 75, 120]), 100, 150, 0.05)!;
    expect(padded.x0).toBeCloseTo(0.2);
    expect(padded.x1).toBeCloseTo(0.8);
  });
  it("não corta página vazia nem conteúdo que já ocupa quase tudo", () => {
    expect(findContentBox(page(100, 150, null), 100, 150)).toBeNull();
    expect(findContentBox(page(100, 150, [2, 2, 98, 148]), 100, 150)).toBeNull();
  });
  it("usa a cor do canto como fundo (página sépia)", () => {
    const b = findContentBox(page(100, 100, [30, 30, 70, 70], 230), 100, 100, 0)!;
    expect(b).toEqual({ x0: 0.3, y0: 0.3, x1: 0.7, y1: 0.7 });
  });
});
