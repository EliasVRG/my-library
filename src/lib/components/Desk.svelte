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
  let deskEl: HTMLDivElement;

  // Painel da resenha ao lado do PDF (telas largas). Em tablet deitado começa fechado para o PDF ter espaço.
  const REVIEW_KEY = "estante:review-panel";
  function initialReview(): boolean {
    try {
      const v = localStorage.getItem(REVIEW_KEY);
      if (v) return v === "1";
    } catch {
      // segue o padrão pela largura
    }
    return window.innerWidth >= 1200;
  }
  let reviewOpen = $state(initialReview());
  function toggleReview() {
    reviewOpen = !reviewOpen;
    try {
      localStorage.setItem(REVIEW_KEY, reviewOpen ? "1" : "0");
    } catch {
      // vale só nesta sessão
    }
  }

  // Modo foco: só o PDF, em tela cheia quando o navegador deixa (no iPhone, Safari não deixa;
  // instalado como app, a tela já é inteira).
  type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
  type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  let focus = $state(false);
  const fsElement = () => document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;

  async function enterFocus() {
    focus = true;
    tab = "ler";
    const el = deskEl as FsEl;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
      else await el.webkitRequestFullscreen?.();
    } catch {
      // Sem tela cheia: o modo foco continua, ocupando a janela.
    }
  }
  async function exitFocus() {
    focus = false;
    if (!fsElement()) return;
    const d = document as FsDoc;
    try {
      if (d.exitFullscreen) await d.exitFullscreen();
      else await d.webkitExitFullscreen?.();
    } catch {
      // já saiu
    }
  }
  const toggleFocus = () => void (focus ? exitFocus() : enterFocus());
  // Saiu da tela cheia pelo sistema (Esc, gesto de voltar): sai do modo foco junto.
  const onFsChange = () => {
    if (!fsElement() && focus) focus = false;
  };

  // Tela acesa enquanto lê em modo foco.
  let wakeLock: { release(): Promise<void> } | null = null;
  async function keepAwake() {
    const wl = (navigator as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!wl || document.visibilityState !== "visible") return;
    try {
      wakeLock = await wl.request("screen");
    } catch {
      // bateria fraca ou sem permissão: a tela apaga normalmente
    }
  }
  $effect(() => {
    if (!focus) return;
    void keepAwake();
    const again = () => document.visibilityState === "visible" && void keepAwake();
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      void wakeLock?.release().catch(() => {});
      wakeLock = null;
    };
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && focus && !fsElement() && !(e.target as HTMLElement).closest("dialog[open]")) {
      e.preventDefault();
      void exitFocus();
    }
  }

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
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
  });
  onDestroy(() => {
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("fullscreenchange", onFsChange);
    document.removeEventListener("webkitfullscreenchange", onFsChange);
    if (fsElement()) void exitFocus();
    void saver.flush();
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="desk" class:focus class:no-review={!reviewOpen} role="dialog" aria-modal="true" aria-labelledby="desk-title" bind:this={deskEl}>
  <header class="deskhead">
    <button class="btn icon" type="button" aria-label="Voltar para a estante" bind:this={backButton} onclick={close}>←</button>
    <div class="t">
      <h2 id="desk-title">{book.title}</h2>
      {#if book.author}<div class="author">{book.author}</div>{/if}
    </div>
    <span class="savestate" class:failed={saver.failed} role="status" aria-live="polite">{saveLabel}</span>
    <button class="btn small reviewtoggle" type="button" aria-pressed={reviewOpen} aria-controls="painel-res" onclick={toggleReview}>
      {reviewOpen ? "Ocultar resenha" : "Resenha"}
    </button>
  </header>
  <div class="tabs" role="tablist" aria-label="Seções">
    <button class="tab" role="tab" type="button" id="tab-ler" aria-selected={tab === "ler"} aria-controls="painel-ler" onclick={() => (tab = "ler")}>Ler</button>
    <button class="tab" role="tab" type="button" id="tab-res" aria-selected={tab === "resenha"} aria-controls="painel-res" onclick={() => (tab = "resenha")}>Resenha</button>
  </div>
  <div class="deskbody" data-tab={tab}>
    <Reader {book} {saver} {focus} active={tab === "ler" || focus} onattach={() => onattach(book)} ontogglefocus={toggleFocus} />
    <ReviewPanel {book} {saver} ondeleted={onclose} onattach={() => onattach(book)} />
  </div>
</div>
