<script lang="ts">
  import { untrack } from "svelte";
  import { REVIEW_FIELDS, pdfState, type Book, type ReviewField, type Status } from "../../../shared/model";
  import { app } from "../app.svelte";
  import { saveFile } from "../download";
  import { formatBytes } from "../pdf/files";
  import type { Saver } from "../saver.svelte";

  let { book, saver, ondeleted, onattach }: { book: Book; saver: Saver; ondeleted: () => void; onattach: () => void } =
    $props();

  // Rótulos curtos da tela; o Markdown exportado continua com os rótulos completos (REVIEW_LABEL).
  const FIELDS: Record<ReviewField, { label: string; placeholder: string }> = {
    resumo: { label: "Resumo", placeholder: "O livro em poucas linhas" },
    argumentos: { label: "Argumentos do autor", placeholder: "As ideias centrais" },
    concordo: { label: "Onde concordo", placeholder: "O que convence" },
    discordo: { label: "Onde discordo", placeholder: "O que não convence" },
    outro_lado: { label: "Como o outro lado responderia", placeholder: "O melhor contra-argumento de outra corrente" },
    notas: { label: "Notas e citações", placeholder: "Trechos e ideias soltas" },
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
  let offlineBusy = $state(false);
  let offlineMsg = $state("");
  let offlineOk = $state(false);
  let saving = $state(false);
  let savedCopy = $state(false);
  let removingPdf = $state(false);
  let storyOpen = $state(false);
  // O gerador de story (canvas, layout) só é baixado quando o painel abre pela primeira vez.
  const loadStory = () => import("./StorySheet.svelte");
  let pdfBusy = $state(false);
  const areas: Partial<Record<ReviewField | "category", HTMLElement>> = $state({});

  const pdf = $derived(pdfState(book));
  const offlineSize = $derived(app.offline.get(id));
  const upload = $derived(app.sync.uploads.get(id));

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

  /** Textarea que cresce com o texto. Navegadores com `field-sizing: content` fazem isso só com CSS. */
  const nativeSizing = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");
  function grow(el: HTMLTextAreaElement, _value: string) {
    const fit = () => {
      if (nativeSizing) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    return { update: fit };
  }

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

  async function toggleOffline() {
    offlineBusy = true;
    offlineOk = false;
    offlineMsg = "";
    try {
      if (offlineSize !== undefined) {
        if (!(await app.files.release(id))) offlineMsg = "Este PDF ainda não foi enviado; não dá para liberar agora.";
      } else {
        await app.files.download(book);
        void app.ensurePersisted();
      }
    } catch (e) {
      offlineMsg = e instanceof Error ? e.message : "Não foi possível baixar.";
    } finally {
      offlineBusy = false;
    }
  }

  /** Entrega o PDF para o usuário guardar onde quiser (vem do aparelho ou, se não houver, da nuvem). */
  async function saveCopy() {
    saving = true;
    offlineMsg = "";
    try {
      const blob = await app.files.fileFor(book);
      const name = book.file_name || `${book.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "livro"}.pdf`;
      saveFile(blob, /\.pdf$/i.test(name) ? name : `${name}.pdf`, "application/pdf");
      savedCopy = true;
      offlineOk = true;
      offlineMsg = "Cópia enviada para a pasta de downloads.";
    } catch (e) {
      offlineOk = false;
      offlineMsg = e instanceof Error ? e.message : "Não foi possível salvar o arquivo.";
    } finally {
      saving = false;
    }
  }

  async function removePdf() {
    pdfBusy = true;
    try {
      await app.store.removePdf(id);
      removingPdf = false;
      offlineOk = true;
      offlineMsg = "PDF removido. Ele sai da nuvem na próxima sincronização.";
    } catch (e) {
      console.error(e);
      offlineOk = false;
      offlineMsg = "Não foi possível remover agora. Tente de novo.";
    } finally {
      pdfBusy = false;
    }
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
    <h3>Resenha</h3>
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
      {FIELDS[f].label}
      <textarea
        rows="1"
        placeholder={FIELDS[f].placeholder}
        bind:this={areas[f]}
        value={draft[f]}
        use:grow={draft[f]}
        oninput={(e) => edit(f, e.currentTarget.value)}
        onblur={() => void saver.flush()}
      ></textarea>
    </label>
  {/each}

  <div class="story-cta">
    <button class="btn" type="button" onclick={() => (storyOpen = true)}>Compartilhar no story</button>
  </div>
  {#if storyOpen}
    {#await loadStory() then { default: StorySheet }}
      <StorySheet {book} bind:open={storyOpen} />
    {/await}
  {/if}

  <section class="filebox" aria-labelledby="pdf-h">
    <h4 class="label" id="pdf-h">PDF</h4>
    {#if pdf === "none"}
      <p class="fmeta">Este livro ainda não tem PDF.</p>
      <div class="facts"><button class="btn small" type="button" onclick={onattach}>Anexar PDF</button></div>
    {:else}
      <p class="fmeta">
        <span class="fname">{book.file_name || "livro.pdf"}</span>
        {#if book.pdf_size}<span class="mono"> · {formatBytes(book.pdf_size)}</span>{/if}
      </p>
      <p class="fmeta">
        {#if pdf === "uploading" && offlineSize !== undefined}
          {upload !== undefined ? `Enviando para a nuvem… ${Math.round(upload * 100)}%` : "Guardado neste aparelho, aguardando envio."}
        {:else if pdf === "uploading"}
          Ainda subindo de outro aparelho.
        {:else if offlineSize !== undefined}
          Disponível offline neste aparelho.
        {:else}
          Só na nuvem; abre quando houver conexão.
        {/if}
      </p>
      <div class="facts">
        {#if pdf === "ready" && offlineSize !== undefined}
          <button class="btn small" type="button" disabled={offlineBusy} onclick={toggleOffline}>Liberar espaço</button>
        {:else if pdf === "ready"}
          <button class="btn small" type="button" disabled={offlineBusy} onclick={toggleOffline}>
            {offlineBusy ? "Baixando…" : "Baixar para ler offline"}
          </button>
        {/if}
        <button class="btn small" type="button" disabled={saving} onclick={saveCopy} title="Salvar uma cópia do PDF neste dispositivo">
          {saving ? "Preparando…" : "Salvar arquivo"}
        </button>
        <button class="btn small ghost" type="button" onclick={onattach}>Trocar PDF</button>
      </div>
      {#if removingPdf}
        <div class="confirm" role="alertdialog" aria-labelledby="rm-q">
          <span id="rm-q">
            Remover o PDF da nuvem e de todos os aparelhos? O livro, a resenha e o progresso ficam.
            {savedCopy ? "Você já salvou uma cópia." : "Se quiser guardar o arquivo, salve uma cópia antes."}
          </span>
          <div class="acts-end">
            {#if !savedCopy}
              <button class="btn ghost" type="button" disabled={saving} onclick={saveCopy}>{saving ? "Preparando…" : "Salvar cópia antes"}</button>
            {/if}
            <button class="btn ghost" type="button" onclick={() => (removingPdf = false)}>Cancelar</button>
            <button class="btn danger solid" type="button" disabled={pdfBusy} onclick={removePdf}>Remover PDF</button>
          </div>
        </div>
      {:else}
        <div><button class="btn danger" type="button" onclick={() => (removingPdf = true)}>Remover PDF</button></div>
      {/if}
    {/if}
    {#if offlineMsg}<p class={offlineOk ? "ok" : "err"} role={offlineOk ? "status" : "alert"}>{offlineMsg}</p>{/if}
  </section>

  <div class="danger-zone">
    {#if confirming}
      <div class="confirm" role="alertdialog" aria-labelledby="del-q">
        <span id="del-q">Excluir “{book.title}”{book.pdf_key ? ", o PDF" : ""} e a resenha? Não dá para desfazer.</span>
        <div class="acts-end">
          <button class="btn ghost" type="button" onclick={() => (confirming = false)}>Cancelar</button>
          <button class="btn danger solid" type="button" disabled={deleting} onclick={remove}>Excluir</button>
        </div>
        {#if deleteError}<p class="err" role="alert">{deleteError}</p>{/if}
      </div>
    {:else}
      <button class="btn danger" type="button" onclick={() => (confirming = true)}>Excluir livro</button>
    {/if}
  </div>
</section>
