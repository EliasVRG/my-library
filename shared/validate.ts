// Validação das alterações recebidas pelo Worker. Tudo que vem do cliente passa por aqui.

import {
  BOOK_FIELDS,
  REVIEW_FIELDS,
  STATUSES,
  isPdfKeyFor,
  isUuid,
  type Change,
  type Clock,
  type FieldClock,
} from "./model";

const MAX_TEXT = 500;
const MAX_REVIEW = 200_000;
/** Relógios no futuro são limitados a isto além da hora do servidor. */
export const MAX_CLOCK_SKEW = 60_000;

type Check = (v: unknown, id: string) => boolean;

const isInt = (min: number, max: number): Check => (v) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isText = (max: number): Check => (v) => typeof v === "string" && v.length <= max;

const BOOK_CHECKS: Record<(typeof BOOK_FIELDS)[number], Check> = {
  title: isText(MAX_TEXT),
  author: isText(MAX_TEXT),
  category: isText(120),
  status: (v) => typeof v === "string" && (STATUSES as readonly string[]).includes(v),
  rating: isInt(0, 5),
  pdf_key: (v, id) => v === null || isPdfKeyFor(id, v),
  file_name: isText(MAX_TEXT),
  pdf_size: isInt(0, Number.MAX_SAFE_INTEGER),
  pages: isInt(0, 1_000_000),
  current_page: isInt(1, 1_000_000),
  started_at: (v) => v === null || (typeof v === "number" && Number.isFinite(v) && v > 0),
  finished_at: (v) => v === null || (typeof v === "number" && Number.isFinite(v) && v > 0),
  deleted_at: (v) => v === null || (typeof v === "number" && Number.isFinite(v) && v > 0),
};

const REVIEW_CHECKS: Record<string, Check> = Object.fromEntries(REVIEW_FIELDS.map((f) => [f, isText(MAX_REVIEW)]));

function isClock(v: unknown): v is Clock {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    Number.isFinite(v[0]) &&
    v[0] > 0 &&
    typeof v[1] === "string" &&
    v[1].length > 0 &&
    v[1].length <= 64
  );
}

export function parseChange(raw: unknown, now: number): Change | string {
  if (!raw || typeof raw !== "object") return "alteração inválida";
  const r = raw as Record<string, unknown>;
  if (r.table !== "books" && r.table !== "reviews") return "tabela inválida";
  if (!isUuid(r.id)) return "id inválido";
  if (!r.fields || typeof r.fields !== "object" || !r.clock || typeof r.clock !== "object") return "campos ausentes";
  const checks = r.table === "books" ? BOOK_CHECKS : REVIEW_CHECKS;
  const fields: Record<string, unknown> = {};
  const clock: FieldClock = {};
  const inFields = r.fields as Record<string, unknown>;
  const inClock = r.clock as Record<string, unknown>;
  for (const [f, v] of Object.entries(inFields)) {
    const check = (checks as Record<string, Check>)[f];
    if (!check) return `campo desconhecido: ${f}`;
    if (!check(v, r.id)) return `valor inválido em ${f}`;
    const c = inClock[f];
    if (!isClock(c)) return `relógio inválido em ${f}`;
    fields[f] = v;
    clock[f] = [Math.min(c[0], now + MAX_CLOCK_SKEW), c[1]];
  }
  const change: Change = { table: r.table, id: r.id, fields, clock };
  if (r.created_at !== undefined) {
    if (typeof r.created_at !== "number" || !Number.isFinite(r.created_at) || r.created_at <= 0) return "created_at inválido";
    change.created_at = Math.min(r.created_at, now);
  }
  return change;
}
