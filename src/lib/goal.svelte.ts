// Meta de livros por ano. Fica neste aparelho (não sincroniza): defina em cada aparelho que usar.

const KEY = "estante:goals";

function read(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export const goals = $state<Record<string, number>>(read());

export function goalFor(year: number): number | null {
  const g = goals[String(year)];
  return Number.isInteger(g) && g > 0 ? g : null;
}

export function setGoal(year: number, n: number | null): void {
  if (n && n > 0) goals[String(year)] = Math.min(1000, Math.round(n));
  else delete goals[String(year)];
  try {
    localStorage.setItem(KEY, JSON.stringify(goals));
  } catch {
    // vale só nesta sessão
  }
}
