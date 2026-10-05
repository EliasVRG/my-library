// Merge campo a campo, "último a escrever vence".
//
// O servidor é a autoridade: ele aplica `mergeBook`/`mergeReview` ao receber alterações.
// O cliente, ao puxar, usa `applyRemote`: aceita o valor do servidor em todo campo que não
// tenha alteração local pendente; campos pendentes ficam com o valor local até o envio ser
// confirmado (aí o próximo pull traz o resultado final). Isso garante que todos convergem
// para o mesmo estado, mesmo com relógios de aparelho errados.

import { BOOK_FIELDS, REVIEW_FIELDS, type Book, type Clock, type FieldClock, type Review } from "./model";

export function compareClock(a: Clock | undefined, b: Clock | undefined): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
}

interface Merged<T> {
  merged: T;
  changed: string[];
}

function mergeFields<T extends { field_clock: FieldClock }>(
  base: T,
  fields: Record<string, unknown>,
  clock: FieldClock,
  allowed: readonly string[],
): Merged<T> {
  const merged = { ...base, field_clock: { ...base.field_clock } } as T;
  const w = merged as Record<string, unknown>;
  const changed: string[] = [];
  for (const f of allowed) {
    if (!(f in fields)) continue;
    const c = clock[f];
    if (!c) continue;
    if (compareClock(c, base.field_clock[f]) > 0) {
      w[f] = fields[f];
      merged.field_clock[f] = c;
      changed.push(f);
    }
  }
  return { merged, changed };
}

/**
 * Exclusão vence tudo: um livro excluído nunca volta, e uma exclusão recebida
 * é aplicada mesmo que outro campo tenha relógio mais novo.
 */
export function mergeBook(base: Book, fields: Record<string, unknown>, clock: FieldClock): Merged<Book> {
  if (base.deleted_at != null) return { merged: base, changed: [] };
  if (fields.deleted_at != null) {
    const c = clock.deleted_at ?? [Date.now(), "?"];
    return {
      merged: { ...base, deleted_at: fields.deleted_at as number, field_clock: { ...base.field_clock, deleted_at: c } },
      changed: ["deleted_at"],
    };
  }
  return mergeFields(base, fields, clock, BOOK_FIELDS.filter((f) => f !== "deleted_at"));
}

export function mergeReview(base: Review, fields: Record<string, unknown>, clock: FieldClock): Merged<Review> {
  return mergeFields(base, fields, clock, REVIEW_FIELDS);
}

/**
 * Aplica um registro vindo do servidor sobre a cópia local, preservando os campos
 * que ainda têm alteração local pendente de envio.
 */
export function applyRemote<T extends { field_clock: FieldClock }>(
  local: T | undefined,
  remote: T,
  pendingFields: Iterable<string>,
): T {
  if (!local) return remote;
  const pending = new Set(pendingFields);
  if (pending.size === 0) return remote;
  const out = { ...remote, field_clock: { ...remote.field_clock } } as T;
  const w = out as Record<string, unknown>;
  const loc = local as Record<string, unknown>;
  for (const f of pending) {
    if (f === "deleted_at") continue; // a exclusão do servidor sempre vale
    w[f] = loc[f];
    const c = local.field_clock[f];
    if (c) out.field_clock[f] = c;
  }
  return out;
}
