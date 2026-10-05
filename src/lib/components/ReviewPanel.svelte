<script lang="ts">
  import { REVIEW_FIELDS, REVIEW_LABEL, type Book, type ReviewField, type Status } from "../../../shared/model";
  import { untrack } from "svelte";
  import { app } from "../app.svelte";
  import type { Saver } from "../saver.svelte";

  let { book, saver, ondeleted }: { book: Book; saver: Saver; ondeleted: () => void } = $props();

  const HINT: Partial<Record<ReviewField, string>> = {
    outro_lado: "O melhor contra-argumento que alguém de outra corrente daria.",
  };

  // A mesa é recriada para cada livro, então o id é fixo durante a vida deste painel.
  const id = untrack(() => book.id);
  const remote = $derived(app.reviews.get(id));
  const initial = app.reviews.get(id);
  let draft = $state(Object.fromEntries(REVIEW_FIELDS.map((f) => [f, initial?.[f] ?? ""])) as Record<ReviewField, string>);
  let category = $state(untrack(() => book.category));
  let confirming = $state(false);
  let deleting = $state(false);
  let deleteError = $state("");
  const areas: Partial<Record<ReviewField | "category", HTMLElement>> = $state({});

  // Mudanças vindas de outro aparelho entram no campo, a menos que ele esteja sendo editado aqui.
  $effect(() => {
    const r = remote;
    if (!r) return;
    for (const f of REVIEW_FIELDS) {
      if (!saver.has(`r:${f}`) && document.activeElement !== areas[f] && draft[f] !== r[f]) draft[f] = r[f];
    }
  });
  const remoteCategory = $derived(book.category);
  $effect(() => {
    const c = remoteCategory;
    if (!saver.has("category") && document.activeElement !== areas.category) category = c;
  });

  function edit(f: ReviewField, value: string) {
    draft[f] = value;
    saver.queue(`r:${f}`, () => app.store.updateReview(id, { [f]: value }));
  }

  function editCategory(value: string) {
    category = value;
    saver.queue("category", () => app.store.updateBook(id, { category: value.trim() }));
  }

  function setStatus(s: Status) {
    void saver.now(() => app.store.updateBook(id, { status: s }));
  }

  function rate(n: number) {
    void saver.now(() => app.store.updateBook(id, { rating: book.rating === n ? 0 : n }));
  }

  async function remove() {
    deleting = true;
    deleteError = "";
    try {
      saver.cancel();
      await app.store.deleteBook(id);
      ondeleted();
    } catch (e) {
      console.error(e);
      deleteError = "Não foi possível excluir agora. Tente de novo.";
      deleting = false;
    }
  }
</script>

<section class="review" id="painel-res" aria-label="Resenha">
  <div class="settings">
    <label class="f">
      Categoria
      <input
        list="catList"
        value={category}
        bind:this={areas.category}
        oninput={(e) => editCategory(e.currentTarget.value)}
        onblur={() => void saver.flush()}
        autocomplete="off"
      />
    </label>
    <label class="f">
      Situação
      <select value={book.status} onchange={(e) => setStatus(e.currentTarget.value as Status)}>
        <option value="quero">Quero ler</option>
        <option value="lendo">Lendo</option>
        <option value="pausado">Pausado</option>
        <option value="lido">Lido</option>
      </select>
    </label>
  </div>

  <div>
    <h3>Minha resenha</h3>
    <fieldset class="rate">
      <legend class="sr-only">Nota</legend>
      {#each [1, 2, 3, 4, 5] as n (n)}
        <button
          type="button"
          class:on={n <= (book.rating || 0)}
          aria-pressed={book.rating === n}
          aria-label="Nota {n} de 5"
          onclick={() => rate(n)}>★</button
        >
      {/each}
    </fieldset>
  </div>

  {#each REVIEW_FIELDS as f (f)}
    <label class="f">
      <span>
        {REVIEW_LABEL[f]}
        {#if HINT[f]}<span class="hint">{HINT[f]}</span>{/if}
      </span>
      <textarea
        bind:this={areas[f]}
        value={draft[f]}
        oninput={(e) => edit(f, e.currentTarget.value)}
        onblur={() => void saver.flush()}
      ></textarea>
    </label>
  {/each}

  <div>
    {#if confirming}
      <div class="confirm" role="alertdialog" aria-labelledby="del-q">
        <span id="del-q">Excluir “{book.title}”{book.pdf_key ? ", o PDF" : ""} e a resenha? Não dá para desfazer.</span>
        <div class="acts-end">
          <button class="btn ghost" type="button" onclick={() => (confirming = false)}>Cancelar</button>
          <button class="btn danger" type="button" disabled={deleting} onclick={remove}>Excluir</button>
        </div>
        {#if deleteError}<p class="err" role="alert">{deleteError}</p>{/if}
      </div>
    {:else}
      <button class="btn danger" type="button" onclick={() => (confirming = true)}>Excluir livro</button>
    {/if}
  </div>
</section>
