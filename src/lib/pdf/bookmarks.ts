// Marcadores de página: guardados no livro como "12,45,80" (ordenado, sem repetir).

export function parseBookmarks(s: string | null | undefined): number[] {
  if (!s) return [];
  const pages = s.split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 1);
  return [...new Set(pages)].sort((a, b) => a - b);
}

export function formatBookmarks(pages: number[]): string {
  return parseBookmarks(pages.join(",")).join(",");
}

/** Marca ou desmarca a página. */
export function toggleBookmark(s: string, page: number): string {
  const pages = parseBookmarks(s);
  return formatBookmarks(pages.includes(page) ? pages.filter((p) => p !== page) : [...pages, page]);
}

