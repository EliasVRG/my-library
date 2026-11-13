import { describe, expect, it } from "vitest";
import { appendCitation, citation, cleanQuote, findAll, fold, foldTerm, pageText, searchPages } from "../../src/lib/pdf/search";

describe("fold", () => {
  it("tira acento e caixa sem mudar o tamanho", () => {
    const s = "Coração, AÇÃO e Ênfase";
    expect(fold(s)).toBe("coracao, acao e enfase");
    expect(fold(s)).toHaveLength(s.length);
  });
});

describe("findAll", () => {
  it("acha ignorando acento e caixa, sem sobreposição", () => {
    expect(findAll("Ação e acao e AÇÃO", foldTerm("ação"))).toEqual([0, 7, 14]);
    expect(findAll("aaaa", "aa")).toEqual([0, 2]);
    expect(findAll("texto", "")).toEqual([]);
  });
});

describe("searchPages", () => {
  it("numera as páginas a partir de 1 e a ordem dentro da página", () => {
    expect(searchPages(["nada aqui", "Capitu e capitu", "", "CAPITU"], "capitu")).toEqual([
      { page: 2, nth: 0 },
      { page: 2, nth: 1 },
      { page: 4, nth: 0 },
    ]);
  });
  it("termo vazio ou só espaços não busca", () => {
    expect(searchPages(["a b"], "   ")).toEqual([]);
  });
  it("junta espaços do termo", () => {
    expect(searchPages(["olhos de ressaca"], "olhos   de")).toEqual([{ page: 1, nth: 0 }]);
  });
});

describe("pageText", () => {
  it("emenda itens e troca fim de linha por espaço", () => {
    expect(pageText([{ str: "olhos de" , hasEOL: true }, { str: "ressaca" }, { str: "," }])).toBe("olhos de ressaca,");
  });
});

describe("citação", () => {
  it("limpa hifenização na quebra de linha e espaços", () => {
    expect(cleanQuote("  olhos de cigana oblí-\nqua e dis-\n simulada.\n\n")).toBe("olhos de cigana oblíqua e dissimulada.");
    // Hífen de verdade, seguido de maiúscula ou sem quebra, fica.
    expect(cleanQuote("guarda-chuva e Rio-\nGrande")).toBe("guarda-chuva e Rio- Grande");
  });
  it("formata com a página e acrescenta às notas com linha em branco", () => {
    const line = citation("Capitu", 42);
    expect(line).toBe("“Capitu” (p. 42)");
    expect(appendCitation("", line)).toBe(line);
    expect(appendCitation("minha nota\n\n", line)).toBe(`minha nota\n\n${line}`);
  });
});
