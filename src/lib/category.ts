// Cor de cada categoria: o mesmo índice (1–6) vira var(--cN) na estante e um hexadecimal no story.

/** Índice 1–6 da cor da categoria, ou null para livro sem categoria. */
export function categoryIndex(name: string): number | null {
  if (!name) return null;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 6) + 1;
}

export function catColor(name: string): string {
  const i = categoryIndex(name);
  return i ? `var(--c${i})` : "var(--faint)";
}
