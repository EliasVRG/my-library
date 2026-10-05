<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { pdfState, type Book } from "../../../shared/model";
  import { app } from "../app.svelte";
  import { formatBytes } from "../pdf/files";
  import { Saver } from "../saver.svelte";
  import Reader from "./Reader.svelte";
  import ReviewPanel from "./ReviewPanel.svelte";

  let { book, onclose, onattach }: { book: Book; onclose: () => void; onattach: (b: Book) => void } = $props();

  const saver = new Saver();
  let tab = $state<"ler" | "resenha">("ler");
  let offlineBusy = $state(false);
  let offlineMsg = $state("");
  let backButton: HTMLButtonElement;

  const saveLabel = $derived.by(() => {
    if (saver.failed) return "Não salvou neste aparelho";
    if (saver.pending) return "Editando…";
    if (app.sync.pendingIds.has(book.id)) return "Salvo neste aparelho, sincronizando…";
    return saver.touched ? "Salvo" : "";
  });

  const pdf = $derived(pdfState(book));
  const offlineSize = $derived(app.offline.get(book.id));
  const upload = $derived(app.sync.uploads.get(book.id));

  async function toggleOffline() {
    offlineBusy = true;
    offlineMsg = "";
    try {
      if (offlineSize !== undefined) {
        if (!(await app.files.release(book.id))) offlineMsg = "Este PDF ainda não foi enviado; não dá para liberar agora.";
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

  async function close() {
    await saver.flush();
    onclose();
  }

  const onPageHide = () => void saver.flush();
  onMount(() => {
    backButton.focus();
    window.addEventListener("pagehide", onPageHide);
  });
  onDestroy(() => {
    window.removeEventListener("pagehide", onPageHide);
    void saver.flush();
  });
</script>

<div class="desk" role="dialog" aria-modal="true" aria-labelledby="desk-title">
  <div class="deskhead">
    <button class="btn" type="button" bind:this={backButton} onclick={close}>← Estante</button>
    <div class="t">
      <h2 id="desk-title">{book.title}</h2>
      <div class="author">{book.author}</div>
    </div>
    <div class="side">
      {#if pdf !== "none"}
        {#if pdf === "uploading" && offlineSize !== undefined}
          <span class="off wait">
            {upload !== undefined ? `Enviando PDF ${Math.round(upload * 100)}%` : "PDF guardado neste aparelho, aguardando envio"}
          </span>
        {:else if pdf === "uploading"}
          <span class="off wait">PDF ainda subindo de outro aparelho</span>
        {:else if offlineSize !== undefined}
          <span class="off">Disponível offline · {formatBytes(offlineSize)}</span>
          <button class="btn small" type="button" disabled={offlineBusy} onclick={toggleOffline}>Liberar espaço</button>
        {:else if pdf === "ready"}
          <button class="btn small" type="button" disabled={offlineBusy} onclick={toggleOffline}>
            {offlineBusy ? "Baixando…" : "Baixar para ler offline"}
          </button>
        {/if}
      {/if}
      <span class="savestate" role="status" aria-live="polite">{saveLabel}</span>
    </div>
    {#if offlineMsg}<p class="err" role="alert" style="width:100%">{offlineMsg}</p>{/if}
  </div>
  <div class="tabs" role="tablist" aria-label="Seções">
    <button class="tab" role="tab" type="button" id="tab-ler" aria-selected={tab === "ler"} aria-controls="painel-ler" onclick={() => (tab = "ler")}>Ler</button>
    <button class="tab" role="tab" type="button" id="tab-res" aria-selected={tab === "resenha"} aria-controls="painel-res" onclick={() => (tab = "resenha")}>Resenha</button>
  </div>
  <div class="deskbody" data-tab={tab}>
    <Reader {book} {saver} active={tab === "ler"} onattach={() => onattach(book)} />
    <ReviewPanel {book} {saver} ondeleted={onclose} />
  </div>
</div>
