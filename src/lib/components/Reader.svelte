<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
  import { pdfState, type Book } from "../../../shared/model";
  import { app } from "../app.svelte";
  import { PdfError } from "../pdf/files";
  import { loadPdfjs } from "../pdf/pdfjs";
  import type { Saver } from "../saver.svelte";

  let { book, saver, active, onattach }: { book: Book; saver: Saver; active: boolean; onattach: () => void } = $props();

  let stage: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let doc = $state.raw<PDFDocumentProxy | null>(null);
  let page = $state(1);
  let pageField = $state("1");
  let zoom = $state(1);
  let message = $state<{ text: string; action?: "attach" | "retry"; actionLabel?: string } | null>(null);
  let loading = false;
  let token = 0;
  let task: RenderTask | null = null;
  let rendering = false;
  let again = false;

  const total = $derived(doc?.numPages ?? 0);
  const ready = $derived(pdfState(book) === "ready");
  // O objeto `book` é trocado a cada atualização da estante; o derivado só muda se a chave mudar.
  const pdfKey = $derived(book.pdf_key);

  async function load() {
    const my = ++token;
    loading = true;
    task?.cancel();
    void doc?.loadingTask.destroy();
    doc = null;
    try {
      if (!book.pdf_key) {
        message = { text: "Este livro ainda não tem PDF. Você já pode escrever a resenha ao lado.", action: "attach", actionLabel: "Anexar PDF" };
        return;
      }
      message = { text: "Abrindo o PDF…" };
      const [blob, pdfjs] = await Promise.all([app.files.open(book), loadPdfjs()]);
      if (my !== token) return;
      const data = new Uint8Array(await blob.arrayBuffer());
      const d = await pdfjs.getDocument({
        data,
        cMapUrl: "/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        wasmUrl: "/pdfjs/wasm/",
        iccUrl: "/pdfjs/iccs/",
      }).promise;
      if (my !== token) {
        void d.loadingTask.destroy();
        return;
      }
      doc = d;
      if (book.pages !== d.numPages) void app.store.updateBook(book.id, { pages: d.numPages });
      page = Math.min(Math.max(1, book.current_page || 1), d.numPages);
      pageField = String(page);
      message = null;
      void render();
    } catch (e) {
      if (my !== token) return;
      console.error(e);
      if (e instanceof PdfError) {
        message =
          e.code === "missing"
            ? { text: e.message, action: "attach", actionLabel: "Anexar outro PDF" }
            : { text: e.message, action: "retry", actionLabel: "Tentar de novo" };
      } else {
        message = {
          text: "Não foi possível abrir este PDF. O arquivo pode estar corrompido.",
          action: "attach",
          actionLabel: "Anexar outro PDF",
        };
      }
    } finally {
      if (my === token) loading = false;
    }
  }

  async function render() {
    if (!doc || !canvas || !stage.clientWidth) return;
    if (rendering) {
      again = true;
      task?.cancel();
      return;
    }
    rendering = true;
    try {
      const p = await doc.getPage(page);
      const avail = Math.max(200, stage.clientWidth - 32);
      const base = p.getViewport({ scale: 1 });
      const scale = Math.min(avail / base.width, 1.6) * zoom;
      const dpr = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
      canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
      task = p.render({ canvas, viewport: vp });
      await task.promise;
    } catch (e) {
      if ((e as { name?: string })?.name !== "RenderingCancelledException") console.error(e);
    } finally {
      task = null;
      rendering = false;
    }
    if (again) {
      again = false;
      void render();
    }
  }

  function goTo(n: number) {
    if (!doc) return;
    n = Math.min(Math.max(1, Math.trunc(n) || 1), doc.numPages);
    pageField = String(n);
    if (n === page) return;
    page = n;
    stage.scrollTop = 0;
    void render();
    const id = book.id;
    const promote = book.status === "quero";
    // Uma gravação por pausa na leitura, não uma por página virada.
    saver.queue("page", () => app.store.updateBook(id, promote ? { current_page: n, status: "lendo" } : { current_page: n }), 500);
  }

  function setZoom(z: number) {
    zoom = Math.min(3, Math.max(0.4, Math.round(z * 10) / 10));
    void render();
  }

  function onKey(e: KeyboardEvent) {
    if (!doc || !active) return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable], dialog[open]")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      goTo(page + 1);
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      goTo(page - 1);
      e.preventDefault();
    }
  }

  // Recarrega quando o PDF do livro muda (anexado, trocado).
  $effect(() => {
    void pdfKey;
    untrack(() => void load());
  });
  // PDF que estava subindo de outro aparelho ficou pronto.
  $effect(() => {
    if (ready && !doc && !loading) untrack(() => void load());
  });
  // Ao voltar para a aba "Ler" no celular, o palco tinha largura zero.
  $effect(() => {
    if (active) untrack(() => void render());
  });

  let resizeTimer: ReturnType<typeof setTimeout>;
  let observer: ResizeObserver;
  onMount(() => {
    observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => void render(), 150);
    });
    observer.observe(stage);
    const retry = () => message?.action === "retry" && void load();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  });
  onDestroy(() => {
    token++;
    observer?.disconnect();
    clearTimeout(resizeTimer);
    task?.cancel();
    void doc?.loadingTask.destroy();
  });
</script>

<svelte:window onkeydown={onKey} />

<section class="reader" id="painel-ler" aria-label="Leitor de PDF">
  {#if doc}
    <div class="rbar">
      <button class="btn" type="button" aria-label="Página anterior" disabled={page <= 1} onclick={() => goTo(page - 1)}>‹</button>
      <span class="mono">
        <input
          inputmode="numeric"
          aria-label="Página atual"
          bind:value={pageField}
          onchange={() => goTo(parseInt(pageField, 10) || page)}
          onkeydown={(e) => e.key === "Enter" && goTo(parseInt(pageField, 10) || page)}
        />
        de {total}
      </span>
      <button class="btn" type="button" aria-label="Próxima página" disabled={page >= total} onclick={() => goTo(page + 1)}>›</button>
      <span class="gap"></span>
      <button class="btn" type="button" aria-label="Diminuir zoom" onclick={() => setZoom(zoom - 0.2)}>−</button>
      <span class="mono" aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button class="btn" type="button" aria-label="Aumentar zoom" onclick={() => setZoom(zoom + 0.2)}>+</button>
    </div>
  {/if}
  <div class="stage" bind:this={stage}>
    <canvas bind:this={canvas} hidden={!doc} aria-label={doc ? `Página ${page} de ${total}` : undefined}></canvas>
    {#if message}
      <div class="stagemsg" role="status">
        <p>{message.text}</p>
        {#if message.action === "attach"}
          <button class="btn primary" type="button" onclick={onattach}>{message.actionLabel}</button>
        {:else if message.action === "retry"}
          <button class="btn" type="button" onclick={() => void load()}>{message.actionLabel}</button>
        {/if}
      </div>
    {/if}
  </div>
</section>
