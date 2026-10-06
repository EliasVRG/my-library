import tokensCss from "../../src/styles/tokens.css?raw";
import { describe, expect, it } from "vitest";
import { emptyBookData, emptyReviewData, type Book, type Review } from "../../shared/model";
import { buildStoryData, hasDebate, HIGHLIGHT_MAX, normalizeHandle, readingDays, storyAlt, type StoryData } from "../../src/lib/story/data";
import { layoutStory, SAFE_BOTTOM, SAFE_TOP } from "../../src/lib/story/layout";
import { CATEGORY_HEX, mix, paletteFor } from "../../src/lib/story/palette";
import { clampLines, fitText, wrap, type FontSpec, type Measurer } from "../../src/lib/story/text";

/** Medidor falso: cada caractere vale meia fonte (mais o tracking); ascendente 0,8 e descendente 0,2. */
const mock: Measurer = {
  width: (text, f) => [...text].length * (f.size * 0.5 + (f.tracking ?? 0)),
  metrics: (f) => ({ ascent: f.size * 0.8, descent: f.size * 0.2 }),
};
const F10: FontSpec = { family: "sans", size: 10 }; // 5 px por caractere

describe("wrap", () => {
  it("quebra por palavra respeitando a largura", () => {
    // "ab cd" mede 25 px (5 por caractere).
    expect(wrap("ab cd efgh", 20, F10, mock)).toEqual(["ab", "cd", "efgh"]);
    expect(wrap("ab cd", 24, F10, mock)).toEqual(["ab", "cd"]);
    expect(wrap("ab cd", 25, F10, mock)).toEqual(["ab cd"]);
  });
  it("junta espaços e quebras de linha", () => {
    expect(wrap("  ab \n\n cd\t", 100, F10, mock)).toEqual(["ab cd"]);
  });
  it("quebra por caractere a palavra maior que a linha", () => {
    expect(wrap("abcdefghij", 20, F10, mock)).toEqual(["abcd", "efgh", "ij"]);
  });
  it("texto vazio não gera linhas", () => {
    expect(wrap("   ", 100, F10, mock)).toEqual([]);
  });
});

describe("clampLines", () => {
  it("não mexe quando cabe", () => {
    expect(clampLines(["a", "b"], 2, 100, F10, mock)).toEqual(["a", "b"]);
  });
  it("corta no fim de uma linha com reticências, tirando palavras até caber", () => {
    // 30 px = 6 caracteres; "abc de" + "…" não cabe, então sobra "abc…".
    expect(clampLines(["abc de", "fgh"], 1, 30, F10, mock)).toEqual(["abc…"]);
  });
  it("tira pontuação antes das reticências", () => {
    expect(clampLines(["ab,", "cd"], 1, 100, F10, mock)).toEqual(["ab…"]);
  });
});

describe("fitText", () => {
  const base = { font: { family: "serif" as const }, lineHeight: 1, maxWidth: 1000 };
  it("usa o tamanho máximo quando cabe", () => {
    const r = fitText({ ...base, text: "curto", max: 76, min: 56, maxHeight: 76 }, mock);
    expect(r.font.size).toBe(76);
    expect(r.truncated).toBe(false);
  });
  it("desce de 2 em 2 até caber", () => {
    // 40 caracteres: em 76 px ocupam 1520 px (2 linhas); em 50 px, 1000 px (1 linha).
    const text = "a".repeat(40);
    const r = fitText({ ...base, text, max: 76, min: 40, maxHeight: 60 }, mock);
    expect(r.font.size).toBe(50);
    expect(r.lines).toHaveLength(1);
    expect(r.truncated).toBe(false);
  });
  it("no mínimo, corta com reticências as linhas que não cabem na altura", () => {
    const text = Array.from({ length: 30 }, () => "palavra").join(" ");
    const r = fitText({ ...base, text, max: 76, min: 56, maxHeight: 56 * 2 }, mock);
    expect(r.font.size).toBe(56);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1].endsWith("…")).toBe(true);
    expect(r.truncated).toBe(true);
    expect(r.height).toBeLessThanOrEqual(56 * 2);
  });
  it("respeita maxLines", () => {
    // 30 px = 6 caracteres: "aa bb" / "cc" em 2 linhas; com maxLines 1, "aa bb…".
    const r = fitText({ ...base, text: "aa bb cc", maxWidth: 30, max: 10, min: 10, maxHeight: 1000, maxLines: 1 }, mock);
    expect(r.lines).toEqual(["aa bb…"]);
    expect(r.truncated).toBe(true);
  });
  it("escala o tracking com a fonte", () => {
    const r = fitText({ ...base, text: "x", max: 50, min: 50, maxHeight: 100, trackingEm: -0.01 }, mock);
    expect(r.font.tracking).toBeCloseTo(-0.5);
  });
});

// ---------- dados ----------

const DAY = 86_400_000;
const jan = (d: number, h = 12) => new Date(2026, 0, d, h).getTime();
let seq = 0;
function book(over: Partial<Book> = {}): Book {
  return { ...emptyBookData(), id: `b${++seq}`, title: "Livro", author: "Autora", pdf_ready_key: null, created_at: 1, updated_at: 1, field_clock: {}, rev: 0, ...over } as Book;
}
function review(over: Partial<Review> = {}): Review {
  return { ...emptyReviewData(), book_id: "x", field_clock: {}, updated_at: 1, rev: 0, ...over } as Review;
}

describe("readingDays", () => {
  it("conta o primeiro e o último dia", () => {
    expect(readingDays({ started_at: jan(1, 1), finished_at: jan(1, 23) })).toBe(1);
    expect(readingDays({ started_at: jan(1, 23), finished_at: jan(2, 1) })).toBe(2);
    expect(readingDays({ started_at: jan(1), finished_at: jan(1) + 11 * DAY })).toBe(12);
  });
  it("sem uma das datas, esconde", () => {
    expect(readingDays({ started_at: null, finished_at: jan(2) })).toBeNull();
    expect(readingDays({ started_at: jan(2), finished_at: null })).toBeNull();
  });
});

describe("buildStoryData", () => {
  it("campos vazios viram null e o trecho padrão é o primeiro campo preenchido", () => {
    const d = buildStoryData(book(), review({ resumo: "  ", argumentos: "Argumento\n\ncentral", notas: "nota" }), []);
    expect(d.highlightOptions.map((o) => o.field)).toEqual(["argumentos", "notas"]);
    expect(d.highlight).toBe("Argumento central");
    expect(d.concordo).toBeNull();
    expect(d.discordo).toBeNull();
    expect(d.outroLado).toBeNull();
    expect(hasDebate(d)).toBe(false);
  });
  it("sem resenha nenhuma, não há trecho nem debate", () => {
    const d = buildStoryData(book(), undefined, []);
    expect(d.highlightOptions).toEqual([]);
    expect(d.highlight).toBeNull();
    expect(hasDebate(d)).toBe(false);
  });
  it("o trecho escolhido é limitado a HIGHLIGHT_MAX caracteres", () => {
    expect(buildStoryData(book(), review(), [], { highlight: "x".repeat(400) }).highlight).toHaveLength(HIGHLIGHT_MAX);
    const words = buildStoryData(book(), review(), [], { highlight: Array(60).fill("palavra").join(" ") }).highlight!;
    expect([...words].length).toBeLessThanOrEqual(HIGHLIGHT_MAX);
    expect(words).toMatch(/ palavra…$/);
  });
  it("basta um campo de debate para o modelo 2", () => {
    expect(hasDebate(buildStoryData(book(), review({ outro_lado: "resposta" }), []))).toBe(true);
  });
  it("sem datas: sem dias e sem linha do ano", () => {
    const d = buildStoryData(book({ pages: 0 }), undefined, []);
    expect(d.days).toBeNull();
    expect(d.pages).toBeNull();
    expect(d.yearLine).toBeNull();
  });
  it("linha do ano conta os lidos no mesmo ano até este", () => {
    const a = book({ finished_at: jan(3) });
    const b = book({ finished_at: jan(10) });
    const c = book({ finished_at: jan(20) });
    const old = book({ finished_at: new Date(2025, 5, 1).getTime() });
    const gone = book({ finished_at: jan(5), deleted_at: 9 });
    const all = [a, b, c, old, gone];
    expect(buildStoryData(b, undefined, all).yearLine).toBe("2º livro lido em 2026");
    expect(buildStoryData(c, undefined, all).yearLine).toBe("3º livro lido em 2026");
  });
  it("próxima leitura: o Quero ler mais recente, sem este livro nem excluídos", () => {
    const self = book({ status: "quero", created_at: 99 });
    const older = book({ status: "quero", title: "Antigo", created_at: 5 });
    const newer = book({ status: "quero", title: "Novo", created_at: 10 });
    const deleted = book({ status: "quero", title: "Excluído", created_at: 50, deleted_at: 51 });
    const reading = book({ status: "lendo", title: "Lendo", created_at: 60 });
    expect(buildStoryData(self, undefined, [self, older, newer, deleted, reading]).next).toBe("Novo");
    expect(buildStoryData(self, undefined, [self, reading]).next).toBeNull();
  });
  it("normaliza o @", () => {
    expect(normalizeHandle(" @@meu.perfil ")).toBe("@meu.perfil");
    expect(normalizeHandle("meu perfil")).toBe("@meuperfil");
    expect(normalizeHandle("  ")).toBeNull();
    expect(normalizeHandle(undefined)).toBeNull();
  });
  it("nota fora da faixa é limitada a 0–5", () => {
    expect(buildStoryData(book({ rating: 9 }), undefined, []).rating).toBe(5);
  });
});

// ---------- layout ----------

const full: StoryData = {
  title: "A Mente Moralista",
  author: "Jonathan Haidt",
  category: "Mente e vieses",
  accent: "#4A5E9E",
  rating: 4,
  pages: 384,
  days: 12,
  highlightOptions: [],
  highlight: "Mudou o jeito como eu discuto política em casa: menos tentar vencer, mais entender por que o outro pensa assim.",
  concordo: "A intuição vem antes do argumento.",
  discordo: "A experiência de vida muda nossos valores.",
  outroLado: "Descrever não diz qual lado está certo.",
  yearLine: "3º livro lido em 2026",
  next: "Rápido e Devagar",
  handle: "@seu.usuario",
};
const long = (n: number) => Array.from({ length: n }, (_, i) => `palavra${i}`).join(" ");
const texts = (ops: ReturnType<typeof layoutStory>["ops"]): string[] =>
  ops.flatMap((o) => (o.k === "text" ? [o.text] : o.k === "group" ? texts(o.ops) : []));

describe("layoutStory", () => {
  const models = ["destaque", "concordo", "terminei"] as const;
  const variants: [string, StoryData][] = [
    ["completo", full],
    ["textos enormes", { ...full, title: long(40), author: long(20), highlight: long(60), concordo: long(80), discordo: long(80), outroLado: long(80), next: long(30) }],
    ["mínimo", { ...full, author: "", category: "", rating: 0, pages: null, days: null, highlight: null, yearLine: null, next: null, handle: null }],
  ];
  for (const model of models)
    for (const [name, data] of variants)
      for (const theme of ["light", "dark"] as const)
        it(`${model} (${name}, ${theme}) fica dentro da área segura`, () => {
          const l = layoutStory(model, data, theme, mock);
          expect(l.bounds.top).toBeGreaterThanOrEqual(SAFE_TOP);
          expect(l.bounds.bottom).toBeLessThanOrEqual(SAFE_BOTTOM + 0.5);
        });

  it("destaque: fonte entre 56 e 76 e reticências quando nem o mínimo cabe", () => {
    const ok = layoutStory("destaque", full, "light", mock).fits.highlight;
    expect(ok.font.size).toBeLessThanOrEqual(76);
    expect(ok.font.size).toBeGreaterThanOrEqual(56);
    const big = layoutStory("destaque", { ...full, highlight: long(200) }, "light", mock).fits.highlight;
    expect(big.font.size).toBe(56);
    expect(big.truncated).toBe(true);
    expect(big.lines.at(-1)!.endsWith("…")).toBe(true);
  });

  it("concordo: esconde os campos vazios", () => {
    const t = texts(layoutStory("concordo", { ...full, discordo: null, outroLado: null }, "light", mock).ops);
    expect(t).toContain("ONDE CONCORDO");
    expect(t).not.toContain("ONDE DISCORDO");
    expect(t).not.toContain("O OUTRO LADO DIRIA");
  });

  it("terminei: sem dias, sem próxima leitura e sem @, os blocos somem", () => {
    const t = texts(layoutStory("terminei", { ...full, days: null, next: null, handle: null, yearLine: null }, "light", mock).ops);
    expect(t.join(" ")).not.toMatch(/dias|Próxima leitura|@|livro lido/);
    expect(t).toContain("384");
  });
});

describe("paleta", () => {
  it("CATEGORY_HEX acompanha --c1…--c6 (tema claro) de tokens.css", () => {
    const light = CATEGORY_HEX.map((_, i) => tokensCss.match(new RegExp(`--c${i + 1}:\\s*(#[0-9a-f]{6})`, "i"))![1].toUpperCase());
    expect([...CATEGORY_HEX]).toEqual(light);
  });
  it("mix reproduz a fórmula dos mockups", () => {
    expect(mix("#4A5E9E", "#F8F8F6", 0.16)).toBe("#dcdfe8");
    expect(paletteFor("destaque", "#4A5E9E", "light").tint).toBe(mix("#4A5E9E", "#F8F8F6", 0.16));
    expect(paletteFor("terminei", "#4A5E9E", "dark").canvas).toBe(mix("#4A5E9E", "#111111", 0.3));
  });
});

describe("storyAlt", () => {
  it("descreve o que o modelo mostra e omite o que está escondido", () => {
    const a = storyAlt("terminei", { ...full, days: null, handle: null });
    expect(a).toContain("Terminei de ler");
    expect(a).toContain("nota 4 de 5");
    expect(a).toContain("384 páginas");
    expect(a).toContain("próxima leitura: Rápido e Devagar");
    expect(a).not.toMatch(/dias|@/);
    expect(storyAlt("destaque", full)).toContain(`trecho: “${full.highlight}”`);
    expect(storyAlt("concordo", { ...full, discordo: null })).not.toContain("onde discordo");
  });
});
