<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Book } from "../../../shared/model";
  import { app } from "../app.svelte";
  import { Saver } from "../saver.svelte";
  import Reader from "./Reader.svelte";
  import ReviewPanel from "./ReviewPanel.svelte";

  let { book, onclose, onattach }: { book: Book; onclose: () => void; onattach: (b: Book) => void } = $props();

  const saver = new Saver();
  let tab = $state<"ler" | "resenha">("ler");
  let backButton: HTMLButtonElement;

  const saveLabel = $derived.by(() => {
    if (saver.failed) return "Não salvou neste aparelho";
    if (saver.pending) return "Editando…";
    if (app.sync.pendingIds.has(book.id)) return "Salvo neste aparelho, sincronizando…";
    return saver.touched ? "Salvo" : "";
  });

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
  <header class="deskhead">
    <button class="btn icon" type="button" aria-label="Voltar para a estante" bind:this={backButton} onclick={close}>←</button>
    <div class="t">
      <h2 id="desk-title">{book.title}</h2>
      {#if book.author}<div class="author">{book.author}</div>{/if}
    </div>
    <span class="savestate" class:failed={saver.failed} role="status" aria-live="polite">{saveLabel}</span>
  </header>
  <div class="tabs" role="tablist" aria-label="Seções">
    <button class="tab" role="tab" type="button" id="tab-ler" aria-selected={tab === "ler"} aria-controls="painel-ler" onclick={() => (tab = "ler")}>Ler</button>
    <button class="tab" role="tab" type="button" id="tab-res" aria-selected={tab === "resenha"} aria-controls="painel-res" onclick={() => (tab = "resenha")}>Resenha</button>
  </div>
  <div class="deskbody" data-tab={tab}>
    <Reader {book} {saver} active={tab === "ler"} onattach={() => onattach(book)} />
    <ReviewPanel {book} {saver} ondeleted={onclose} onattach={() => onattach(book)} />
  </div>
</div>
