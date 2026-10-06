import { describe, expect, it } from "vitest";
import { readingDates } from "../../shared/model";
import { openEstanteDb } from "../../src/lib/db/idb";
import { LocalStore } from "../../src/lib/db/repo";

let t = 1_000;
let n = 0;
const fresh = async () => LocalStore.open(await openEstanteDb(`datas-${++n}`), () => t);

describe("readingDates", () => {
  it("marca o início só na primeira vez que vira Lendo", () => {
    expect(readingDates({ status: "quero" }, "lendo", 5)).toEqual({ started_at: 5 });
    expect(readingDates({ status: "pausado", started_at: 2 }, "lendo", 9)).toEqual({});
  });
  it("marca o fim sempre que vira Lido, e nada se a situação não mudou", () => {
    expect(readingDates({ status: "lendo", started_at: 2 }, "lido", 9)).toEqual({ finished_at: 9 });
    expect(readingDates({ status: "lido" }, "lido", 9)).toEqual({});
    expect(readingDates({ status: "lendo" }, undefined, 9)).toEqual({});
  });
});

describe("LocalStore preenche as datas", () => {
  it("ao avançar de Quero ler para Lendo e depois Lido", async () => {
    const store = await fresh();
    t = 1_000;
    const b = await store.createBook({ title: "Livro" });
    expect(b.started_at).toBeNull();
    t = 2_000;
    await store.updateBook(b.id, { current_page: 2, status: "lendo" });
    t = 3_000;
    await store.updateBook(b.id, { status: "pausado" });
    await store.updateBook(b.id, { status: "lendo" });
    t = 9_000;
    await store.updateBook(b.id, { status: "lido" });
    const done = (await store.getBook(b.id))!;
    expect(done.started_at).toBe(2_000);
    expect(done.finished_at).toBe(9_000);
    // As datas vão para a fila de saída como campos comuns (merge por campo).
    const [item] = await store.outbox();
    expect(item.kind === "record" && Object.keys(item.fields)).toEqual(expect.arrayContaining(["started_at", "finished_at"]));
  });

  it("ao cadastrar já como Lendo ou Lido", async () => {
    const store = await fresh();
    t = 4_000;
    expect((await store.createBook({ title: "A", status: "lendo" })).started_at).toBe(4_000);
    const lido = await store.createBook({ title: "B", status: "lido" });
    expect(lido.finished_at).toBe(4_000);
    expect(lido.started_at).toBeNull();
  });
});
