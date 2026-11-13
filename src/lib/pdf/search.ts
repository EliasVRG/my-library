// Busca no texto do PDF e limpeza de trechos citados. Puro, para os testes.

/**
 * Minúsculas e sem acento, caractere a caractere: o resultado tem o mesmo tamanho do original,
 * então uma posição achada no texto "dobrado" vale no original (para marcar na página).
 */
export function fold(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const f = c.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt");
    out += f.length === 1 ? f : c.toLocaleLowerCase("pt").length === 1 ? c.toLocaleLowerCase("pt") : c;
  }
  return out;
}

/** Termo de busca normalizado: espaços juntados, sem acento, minúsculo. Vazio = não buscar. */
export function foldTerm(term: string): string {
  return fold(term.trim().replace(/\s+/g, " "));
}

/** Posições (início) de cada ocorrência de `term` (já dobrado) em `text`, sem sobreposição. */
export function findAll(text: string, term: string): number[] {
  if (!term) return [];
  const hay = fold(text);
  const out: number[] = [];
  for (let i = hay.indexOf(term); i !== -1; i = hay.indexOf(term, i + term.length)) out.push(i);
  return out;
}

export interface Match {
  /** Página (1…N). */
  page: number;
  /** Ordem da ocorrência dentro da página (0…). */
  nth: number;
}

/** Todas as ocorrências do livro, página por página. `pages[0]` é o texto da página 1. */
export function searchPages(pages: string[], term: string): Match[] {
  const t = foldTerm(term);
  if (!t) return [];
  const out: Match[] = [];
  pages.forEach((text, i) => findAll(text, t).forEach((_, nth) => out.push({ page: i + 1, nth })));
  return out;
}

/**
 * Texto de uma página a partir dos itens do pdf.js: itens da mesma linha emendados, quebra de
 * linha vira espaço (assim "o Brasil" acha mesmo quando quebra entre linhas).
 */
export function pageText(items: { str: string; hasEOL?: boolean }[]): string {
  let out = "";
  for (const it of items) {
    out += it.str;
    if (it.hasEOL) out += " ";
  }
  return out.replace(/\s+/g, " ");
}

/**
 * Trecho selecionado pronto para citar: junta palavras hifenizadas na quebra de linha
 * ("pala-\nvra" → "palavra"), junta linhas e tira espaços sobrando.
 */
export function cleanQuote(raw: string): string {
  return raw
    .replace(/(\p{L})[-­]\s*\n\s*(\p{Ll})/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Linha que vai para "Notas e citações". */
export function citation(quote: string, page: number): string {
  return `“${quote}” (p. ${page})`;
}

/** Acrescenta a citação às notas, separada por uma linha em branco. */
export function appendCitation(notes: string, line: string): string {
  const base = notes.replace(/\s+$/, "");
  return base ? `${base}\n\n${line}` : line;
}
