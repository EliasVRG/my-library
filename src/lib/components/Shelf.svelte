<script lang="ts">
  import { PLAN, hasReview, type Status } from "../../../shared/model";
  import { app } from "../app.svelte";
  import BookCard from "./BookCard.svelte";

  let { onopen, onadd }: { onopen: (id: string) => void; onadd: () => void } = $props();

  const NONE = "Sem categoria";
  const ORDER: Record<Status, number> = { lendo: 0, pausado: 1, quero: 2, lido: 3 };

  let q = $state("");
  let status = $state<"todos" | Status>("todos");
  let cat = $state("Todas");
  let addingPlan = $state(false);
  let planError = $state("");

  const books = $derived(app.books);
  const cats = $derived.by(() => {
    const m = new Map<string, number>();
    for (const b of books) m.set(b.category || NONE, (m.get(b.category || NONE) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt"));
  });
  const activeCat = $derived(cat === "Todas" || cats.some(([c]) => c === cat) ? cat : "Todas");
  const count = (s: Status) => books.filter((b) => b.status === s).length;
  const withReview = $derived(books.filter((b) => hasReview(app.reviews.get(b.id))).length);

  const shown = $derived.by(() => {
    const term = q.trim().toLocaleLowerCase("pt");
    return books
      .filter(
        (b) =>
          (activeCat === "Todas" || (b.category || NONE) === activeCat) &&
          (status === "todos" || b.status === status) &&
          (!term || b.title.toLocaleLowerCase("pt").includes(term) || b.author.toLocaleLowerCase("pt").includes(term)),
      )
      .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || b.updated_at - a.updated_at);
  });

  async function addPlan() {
    addingPlan = true;
    planError = "";
    try {
      await app.store.createMany(PLAN.map(([title, author, category]) => ({ title, author, category, status: "quero" })));
    } catch (e) {
      console.error(e);
      planError = "Não foi possível adicionar a lista agora. Tente de novo.";
    } finally {
      addingPlan = false;
    }
  }
</script>

{#if books.length}
  <div class="counts" aria-label="Resumo">
    <span><b>{count("lendo")}</b>lendo</span>
    <span><b>{count("lido")}</b>lidos</span>
    <span><b>{count("quero")}</b>na fila</span>
    <span><b>{withReview}</b>com resenha</span>
  </div>
  <div class="toolbar">
    <input class="search" type="search" placeholder="Buscar por título ou autor" aria-label="Buscar por título ou autor" bind:value={q} />
    <select class="small" aria-label="Filtrar por situação" bind:value={status}>
      <option value="todos">Todas as situações</option>
      <option value="lendo">Lendo</option>
      <option value="quero">Quero ler</option>
      <option value="pausado">Pausado</option>
      <option value="lido">Lido</option>
    </select>
  </div>
  <div class="chips" role="group" aria-label="Filtrar por categoria">
    {#each [["Todas", books.length] as [string, number], ...cats] as [c, n] (c)}
      <button class="chip" type="button" aria-pressed={c === activeCat} onclick={() => (cat = c)}>
        {c}<span class="n"><span class="sr-only">: </span>{n}</span>
      </button>
    {/each}
  </div>
  {#if shown.length}
    <div class="grid">
      {#each shown as book (book.id)}
        <BookCard {book} onopen={() => onopen(book.id)} />
      {/each}
    </div>
  {:else}
    <div class="empty"><p>Nenhum livro com esses filtros.</p></div>
  {/if}
{:else}
  <div class="empty">
    <h2>Sua estante está vazia</h2>
    <p>
      Adicione um livro com o PDF para ler aqui mesmo. A página onde você parou fica salva sozinha, e cada livro tem um
      espaço para a resenha.
    </p>
    <div class="acts">
      <button class="btn primary" type="button" onclick={onadd}>Adicionar livro</button>
      <button class="btn" type="button" onclick={addPlan} disabled={addingPlan}>
        {addingPlan ? "Adicionando…" : "Adicionar os 12 livros do plano de estudo"}
      </button>
    </div>
    {#if planError}<p class="err" role="alert">{planError}</p>{/if}
  </div>
{/if}
