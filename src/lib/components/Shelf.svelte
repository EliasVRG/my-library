<script lang="ts">
  import { PLAN, type Status } from "../../../shared/model";
  import { app } from "../app.svelte";
  import BookCard from "./BookCard.svelte";
  import ContinueReading from "./ContinueReading.svelte";

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
  <ContinueReading {onopen} />

  <section aria-label="Biblioteca">
    <div class="filters">
      <div class="cats" role="group" aria-label="Filtrar por categoria">
        {#each [["Todas", books.length] as [string, number], ...cats] as [c, n] (c)}
          <button class="cat-tab" type="button" aria-pressed={c === activeCat} onclick={() => (cat = c)}>
            {c}<span class="n"><span class="sr-only">: </span>{n}</span>
          </button>
        {/each}
      </div>
      <div class="ftools">
        <input class="search" type="search" placeholder="Buscar" aria-label="Buscar por título ou autor" bind:value={q} />
        <select class="seg" aria-label="Filtrar por situação" bind:value={status}>
          <option value="todos">Todos</option>
          <option value="lendo">Lendo</option>
          <option value="quero">Quero ler</option>
          <option value="pausado">Pausado</option>
          <option value="lido">Lido</option>
        </select>
      </div>
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
  </section>
{:else}
  <div class="empty">
    <h2>Uma estante vazia</h2>
    <p>
      Adicione um PDF para ler aqui mesmo. A página onde você parou fica salva, e cada livro ganha um espaço para a sua
      resenha.
    </p>
    <div class="acts">
      <button class="btn primary" type="button" onclick={onadd}>Adicionar livro</button>
      <button class="btn" type="button" onclick={addPlan} disabled={addingPlan}>
        {addingPlan ? "Adicionando…" : "Usar os 12 livros do plano de estudo"}
      </button>
    </div>
    {#if planError}<p class="err" role="alert">{planError}</p>{/if}
  </div>
{/if}
