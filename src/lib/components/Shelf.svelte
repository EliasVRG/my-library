<script lang="ts">
  import { PLAN, type Status } from "../../../shared/model";
  import { app } from "../app.svelte";
  import { categoryCounts, makeSeries, NO_CATEGORY, seriesKey, shelfEntries, volumeLabel } from "../shelf";
  import BookCard from "./BookCard.svelte";
  import ContinueReading from "./ContinueReading.svelte";
  import SeriesCard from "./SeriesCard.svelte";

  let { onopen, onadd }: { onopen: (id: string) => void; onadd: () => void } = $props();

  /** Quantas categorias aparecem como abas; as outras ficam em "Mais". */
  const TOP = 5;

  let q = $state("");
  let status = $state<"todos" | Status>("todos");
  let cat = $state("Todas");
  let addingPlan = $state(false);
  let planError = $state("");
  let moreOpen = $state(false);
  let moreQ = $state("");
  let moreBox = $state<HTMLDivElement>();
  let moreSearch = $state<HTMLInputElement>();
  /** Coleção aberta (chave), ou null para a estante inteira. */
  let openSeries = $state<string | null>(null);

  const books = $derived(app.books);
  const cats = $derived(categoryCounts(books));
  const activeCat = $derived(cat === "Todas" || cats.some(([c]) => c === cat) ? cat : "Todas");
  const topCats = $derived(cats.slice(0, TOP));
  const restCats = $derived(cats.slice(TOP));
  // Categoria escolhida em "Mais" ganha uma aba enquanto estiver ativa.
  const extraCat = $derived(restCats.find(([c]) => c === activeCat));
  const restShown = $derived.by(() => {
    const t = moreQ.trim().toLocaleLowerCase("pt");
    return t ? restCats.filter(([c]) => c.toLocaleLowerCase("pt").includes(t)) : restCats;
  });

  const term = $derived(q.trim().toLocaleLowerCase("pt"));
  const filtered = $derived(
    books.filter(
      (b) =>
        (activeCat === "Todas" || (b.category.trim() || NO_CATEGORY) === activeCat) &&
        (status === "todos" || b.status === status) &&
        (!term ||
          b.title.toLocaleLowerCase("pt").includes(term) ||
          b.author.toLocaleLowerCase("pt").includes(term) ||
          (b.series ?? "").toLocaleLowerCase("pt").includes(term)),
    ),
  );
  // Buscando, cada livro aparece sozinho (a busca acha volumes dentro das coleções).
  const entries = $derived(term ? filtered.map((book) => ({ kind: "book" as const, book })) : shelfEntries(filtered));
  const series = $derived.by(() => {
    if (!openSeries) return null;
    const group = books.filter((b) => seriesKey(b.series) === openSeries);
    return group.length ? makeSeries(openSeries, group) : null;
  });
  // A coleção ficou vazia (volumes excluídos ou renomeados): volta para a estante.
  $effect(() => {
    if (openSeries && !series) openSeries = null;
  });

  function pickCat(c: string) {
    cat = c;
    moreOpen = false;
    moreQ = "";
  }

  $effect(() => {
    if (!moreOpen) return;
    moreSearch?.focus();
    const outside = (e: PointerEvent) => !moreBox?.contains(e.target as Node) && (moreOpen = false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (moreOpen = false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
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

{#if books.length && series}
  <section class="series-view" aria-labelledby="series-h">
    <div class="series-head">
      <button class="btn icon" type="button" aria-label="Voltar para a estante" onclick={() => (openSeries = null)}>←</button>
      <div>
        <h2 id="series-h">{series.name}</h2>
        <p class="sub">
          {series.author ? `${series.author} · ` : ""}{series.books.length} volumes · <span class="mono">{series.read}</span> lidos
        </p>
      </div>
    </div>
    <div class="grid">
      {#each series.books as book (book.id)}
        <div class="vol">
          {#if book.series_index != null}<span class="vol-n mono">{volumeLabel(book.series_index)}</span>{/if}
          <BookCard {book} onopen={() => onopen(book.id)} />
        </div>
      {/each}
    </div>
  </section>
{:else if books.length}
  <ContinueReading {onopen} />

  <section aria-label="Biblioteca">
    <div class="filters">
      <div class="cats" role="group" aria-label="Filtrar por categoria">
        {#each [["Todas", books.length] as [string, number], ...topCats, ...(extraCat ? [extraCat] : [])] as [c, n] (c)}
          <button class="cat-tab" type="button" aria-pressed={c === activeCat} onclick={() => pickCat(c)}>
            {c}<span class="n"><span class="sr-only">: </span>{n}</span>
          </button>
        {/each}
        {#if restCats.length}
          <div class="more" bind:this={moreBox}>
            <button class="cat-tab" type="button" aria-expanded={moreOpen} aria-controls="more-cats" onclick={() => (moreOpen = !moreOpen)}>
              Mais<span class="n"><span class="sr-only">: </span>{restCats.length}</span> <span aria-hidden="true">▾</span>
            </button>
            {#if moreOpen}
              <div class="more-pop" id="more-cats">
                <input
                  class="search"
                  type="search"
                  placeholder="Buscar categoria"
                  aria-label="Buscar categoria"
                  bind:this={moreSearch}
                  bind:value={moreQ}
                  onkeydown={(e) => e.key === "Enter" && restShown[0] && pickCat(restShown[0][0])}
                />
                <ul>
                  {#each restShown as [c, n] (c)}
                    <li>
                      <button type="button" aria-pressed={c === activeCat} onclick={() => pickCat(c)}>
                        <span>{c}</span><span class="n mono">{n}</span>
                      </button>
                    </li>
                  {:else}
                    <li class="hint">Nenhuma categoria com esse nome.</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <div class="ftools">
        <input class="search" type="search" placeholder="Buscar" aria-label="Buscar por título, autor ou coleção" bind:value={q} />
        <select class="seg" aria-label="Filtrar por situação" bind:value={status}>
          <option value="todos">Todos</option>
          <option value="lendo">Lendo</option>
          <option value="quero">Quero ler</option>
          <option value="pausado">Pausado</option>
          <option value="lido">Lido</option>
        </select>
      </div>
    </div>

    {#if entries.length}
      <div class="grid">
        {#each entries as e (e.kind === "book" ? e.book.id : `s:${e.key}`)}
          {#if e.kind === "book"}
            <BookCard book={e.book} onopen={() => onopen(e.book.id)} />
          {:else}
            <SeriesCard entry={e} onopen={() => (openSeries = e.key)} />
          {/if}
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
