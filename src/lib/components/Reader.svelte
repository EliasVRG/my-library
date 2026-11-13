<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import type { PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
  import { pdfState, type Book } from "../../../shared/model";
  import { app } from "../app.svelte";
  import { PdfError } from "../pdf/files";
  import { loadPdfjs } from "../pdf/pdfjs";
  import { appendCitation, citation, cleanQuote, findAll, foldTerm, pageText, type Match } from "../pdf/search";
  import type { Saver } from "../saver.svelte";

  let {
    book,
    saver,
    active,
    focus = false,
    onattach,
    ontogglefocus,
  }: { book: Book; saver: Saver; active: boolean; focus?: boolean; onattach: () => void; ontogglefocus: () => void } = $props();

  let stage: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let pagebox: HTMLDivElement;
  let textDiv: HTMLDivElement;
  let textLayer: TextLayer | null = null;
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
    texts = [];
    matches = [];
    current = -1;
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
      // No modo foco a página ocupa a largura toda (tablet); fora dele, com margem e um teto de tamanho.
      const avail = Math.max(200, stage.clientWidth - (focus ? 16 : 40));
      const base = p.getViewport({ scale: 1 });
      const scale = Math.min(avail / base.width, focus ? 3 : 1.5) * zoom;
      const dpr = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
      canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
      task = p.render({ canvas, viewport: vp });
      await task.promise;
      // Camada de texto invisível por cima do desenho: seleção, cópia e marcação da busca.
      textLayer?.cancel();
      textDiv.replaceChildren();
      pagebox.style.setProperty("--total-scale-factor", String(scale));
      const pdfjs = await loadPdfjs();
      const tl = new pdfjs.TextLayer({ textContentSource: p.streamTextContent(), container: textDiv, viewport: p.getViewport({ scale }) });
      textLayer = tl;
      await tl.render();
      if (textLayer === tl) markHits();
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name !== "RenderingCancelledException" && name !== "AbortException") console.error(e);
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
    // A busca do navegador só veria a página atual; a nossa procura no livro todo.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && !(e.target as HTMLElement).closest("dialog[open]")) {
      e.preventDefault();
      openSearch();
      return;
    }
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

  // ---------- busca no livro ----------

  let searchOpen = $state(false);
  let query = $state("");
  let matches = $state.raw<Match[]>([]);
  let current = $state(-1);
  let searching = $state(false);
  let searched = $state(0);
  let searchInput = $state<HTMLInputElement>();
  /** Texto de cada página (índice 0 = página 1), extraído na primeira busca e guardado. */
  let texts: (string | undefined)[] = [];
  let searchGen = 0;

  function openSearch() {
    searchOpen = true;
    showBar();
    void Promise.resolve().then(() => searchInput?.select());
  }
  function closeSearch() {
    searchOpen = false;
    query = "";
  }

  async function runSearch(term: string) {
    const gen = ++searchGen;
    const t = foldTerm(term);
    const d = doc;
    matches = [];
    current = -1;
    markHits();
    if (!t || !d) {
      searching = false;
      return;
    }
    searching = true;
    searched = 0;
    const found: Match[] = [];
    const from = page;
    for (let i = 1; i <= d.numPages; i++) {
      if (texts[i - 1] === undefined) {
        const content = await (await d.getPage(i)).getTextContent();
        texts[i - 1] = pageText(content.items.filter((it) => "str" in it));
      }
      if (gen !== searchGen || d !== doc) return;
      findAll(texts[i - 1]!, t).forEach((_, nth) => found.push({ page: i, nth }));
      searched = i;
      // Mostra o primeiro resultado a partir da página atual assim que aparece.
      if (current < 0) {
        const k = found.findIndex((m) => m.page >= from);
        if (k >= 0) {
          matches = [...found];
          show(k);
        }
      }
      if (i % 25 === 0) matches = [...found];
    }
    matches = found;
    searching = false;
    if (current < 0 && found.length) show(0);
  }

  // Busca enquanto digita, com uma pequena pausa.
  $effect(() => {
    const q = query;
    if (!searchOpen) return untrack(() => void runSearch(""));
    const t = setTimeout(() => void runSearch(q), 250);
    return () => clearTimeout(t);
  });

  function show(i: number) {
    if (!matches.length) return;
    current = (i + matches.length) % matches.length;
    const m = matches[current];
    if (m.page !== page) goTo(m.page);
    else markHits();
  }

  /** Marca as ocorrências na camada de texto da página e rola até a atual. */
  function markHits() {
    if (!textDiv) return;
    for (const m of textDiv.querySelectorAll("mark.hit")) m.replaceWith(...m.childNodes);
    textDiv.normalize();
    const t = searchOpen ? foldTerm(query) : "";
    if (!t) return;
    const leaves = [...textDiv.querySelectorAll("span")].filter((s) => s.childNodes.length === 1 && s.firstChild?.nodeType === Node.TEXT_NODE);
    const marks: HTMLElement[] = [];
    for (const span of leaves) {
      const text = span.textContent ?? "";
      const at = findAll(text, t);
      if (!at.length) continue;
      const frag = document.createDocumentFragment();
      let pos = 0;
      for (const i of at) {
        frag.append(text.slice(pos, i));
        const mk = document.createElement("mark");
        mk.className = "hit";
        mk.textContent = text.slice(i, i + t.length);
        frag.append(mk);
        marks.push(mk);
        pos = i + t.length;
      }
      frag.append(text.slice(pos));
      span.replaceChildren(frag);
    }
    const m = matches[current];
    if (m && m.page === page && marks.length) {
      const now = marks[Math.min(m.nth, marks.length - 1)];
      now.classList.add("now");
      now.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }

  // ---------- seleção: copiar e salvar citação ----------

  let picked = $state<string | null>(null);
  let pickedTimer: ReturnType<typeof setTimeout>;
  let note = $state("");
  let noteTimer: ReturnType<typeof setTimeout>;

  function onSelectionChange() {
    const s = document.getSelection();
    const inside = !!s && !s.isCollapsed && !!s.anchorNode && textDiv?.contains(s.anchorNode);
    clearTimeout(pickedTimer);
    if (inside) {
      const text = cleanQuote(s!.toString());
      picked = text || null;
    } else if (picked) {
      // Tocar num botão da barra pode desfazer a seleção antes do clique: espera um pouco.
      pickedTimer = setTimeout(() => (picked = null), 400);
    }
  }

  function flash(text: string) {
    note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note = ""), 2500);
  }

  async function copyPicked() {
    const q = picked;
    if (!q) return;
    try {
      await navigator.clipboard.writeText(q);
      flash("Trecho copiado.");
    } catch {
      flash("Não foi possível copiar. Use o copiar do sistema.");
    }
  }

  async function savePicked() {
    const q = picked;
    if (!q) return;
    try {
      // Edições da resenha ainda na fila entram antes, para a citação não sobrescrever nada.
      await saver.flush();
      const notes = (await app.store.getReview(book.id))?.notas ?? "";
      await app.store.updateReview(book.id, { notas: appendCitation(notes, citation(q, page)) });
      document.getSelection()?.removeAllRanges();
      picked = null;
      flash(`Citação da p. ${page} salva em Notas e citações.`);
    } catch (e) {
      console.error(e);
      flash("Não foi possível salvar a citação. Tente de novo.");
    }
  }

  // ---------- modo foco: barra que some, toques nas bordas e deslizar ----------

  let barHidden = $state(false);
  let hideTimer: ReturnType<typeof setTimeout>;
  function showBar() {
    barHidden = false;
    clearTimeout(hideTimer);
    if (focus) hideTimer = setTimeout(() => (barHidden = true), 3000);
  }
  $effect(() => {
    if (focus) untrack(showBar);
    else {
      clearTimeout(hideTimer);
      barHidden = false;
    }
    untrack(() => void render());
  });

  let down: { x: number; y: number; t: number } | null = null;
  function onPointerDown(e: PointerEvent) {
    down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
  }
  function onPointerUp(e: PointerEvent) {
    const d = down;
    down = null;
    if (!d || !focus || !doc || (e.target as HTMLElement).closest("button, input, a")) return;
    // Arrastar para selecionar texto não é toque nem deslizar.
    if (!document.getSelection()?.isCollapsed) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // Deslizar para o lado vira a página, a menos que a página (com zoom) role na horizontal.
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy) && stage.scrollWidth <= stage.clientWidth + 1) {
      goTo(dx < 0 ? page + 1 : page - 1);
      return;
    }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10 || e.timeStamp - d.t > 400) return;
    // Toque: bordas viram a página, o meio mostra ou esconde a barra.
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.25) goTo(page - 1);
    else if (x > 0.75) goTo(page + 1);
    else if (barHidden) showBar();
    else {
      clearTimeout(hideTimer);
      barHidden = true;
    }
  }

  /** Mexer na barra (toque ou teclado) adia o sumiço dela. */
  function keepsBar(el: HTMLElement) {
    el.addEventListener("pointerdown", showBar);
    el.addEventListener("focusin", showBar);
    return {
      destroy() {
        el.removeEventListener("pointerdown", showBar);
        el.removeEventListener("focusin", showBar);
      },
    };
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
    // Gestos do modo foco; os mesmos comandos existem nos botões e nas setas do teclado.
    const cancel = () => (down = null);
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("pointercancel", cancel);
    const retry = () => message?.action === "retry" && void load();
    window.addEventListener("online", retry);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("online", retry);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", cancel);
    };
  });
  onDestroy(() => {
    token++;
    observer?.disconnect();
    clearTimeout(resizeTimer);
    clearTimeout(hideTimer);
    clearTimeout(pickedTimer);
    clearTimeout(noteTimer);
    searchGen++;
    textLayer?.cancel();
    task?.cancel();
    void doc?.loadingTask.destroy();
  });
</script>

<svelte:window onkeydown={onKey} />

<section class="reader" id="painel-ler" aria-label="Leitor de PDF">
  <div class="stage" bind:this={stage}>
    <div class="pagebox" bind:this={pagebox} hidden={!doc}>
      <canvas bind:this={canvas} aria-hidden="true"></canvas>
      <div class="textLayer" bind:this={textDiv} role="document" aria-label={doc ? `Texto da página ${page} de ${total}` : undefined}></div>
    </div>
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
  {#if doc && searchOpen}
    <div class="findbar" role="search">
      <input
        bind:this={searchInput}
        bind:value={query}
        type="search"
        placeholder="Buscar no livro"
        aria-label="Buscar no livro"
        onkeydown={(e) => {
          if (e.key === "Enter") show(current + (e.shiftKey ? -1 : 1));
          else if (e.key === "Escape") closeSearch();
        }}
      />
      <span class="mono findcount" aria-live="polite">
        {#if !foldTerm(query)}
          &nbsp;
        {:else if matches.length && current >= 0}
          {current + 1}/{matches.length}{searching ? "+" : ""}
        {:else if matches.length}
          {matches.length}+
        {:else if searching}
          {Math.round((100 * searched) / total)}%
        {:else}
          0
        {/if}
      </span>
      <button class="btn icon" type="button" aria-label="Resultado anterior" disabled={!matches.length} onclick={() => show(current - 1)}>‹</button>
      <button class="btn icon" type="button" aria-label="Próximo resultado" disabled={!matches.length} onclick={() => show(current + 1)}>›</button>
      <button class="btn icon" type="button" aria-label="Fechar busca" onclick={closeSearch}>✕</button>
    </div>
  {/if}
  {#if doc && picked}
    <div class="selbar" role="toolbar" aria-label="Trecho selecionado">
      <button class="btn small" type="button" onpointerdown={(e) => e.preventDefault()} onclick={() => void copyPicked()}>Copiar</button>
      <button class="btn small primary" type="button" onpointerdown={(e) => e.preventDefault()} onclick={() => void savePicked()}>Salvar citação</button>
    </div>
  {/if}
  {#if note}<div class="readnote" role="status">{note}</div>{/if}
  {#if doc}
    {#if focus && barHidden}
      <div class="pagepill mono" aria-hidden="true">{page}/{total}</div>
    {/if}
    <div class="rbar" class:hidden={barHidden} role="toolbar" aria-label="Controles de leitura" use:keepsBar>
      <button class="btn icon" type="button" aria-label="Página anterior" disabled={page <= 1} onclick={() => goTo(page - 1)}>‹</button>
      <input
        class="mono"
        inputmode="numeric"
        aria-label="Página atual"
        bind:value={pageField}
        onchange={() => goTo(parseInt(pageField, 10) || page)}
        onkeydown={(e) => e.key === "Enter" && goTo(parseInt(pageField, 10) || page)}
      />
      <span class="of">de <span class="mono">{total}</span></span>
      <button class="btn icon" type="button" aria-label="Próxima página" disabled={page >= total} onclick={() => goTo(page + 1)}>›</button>
      <span class="sep zoom" aria-hidden="true"></span>
      <button class="btn icon zoom" type="button" aria-label="Diminuir zoom" onclick={() => setZoom(zoom - 0.2)}>−</button>
      <span class="mono zoom zlbl" aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button class="btn icon zoom" type="button" aria-label="Aumentar zoom" onclick={() => setZoom(zoom + 0.2)}>+</button>
      <span class="sep" aria-hidden="true"></span>
      <button class="btn icon" type="button" aria-label="Buscar no livro" title="Buscar no livro (Ctrl+F)" aria-pressed={searchOpen} onclick={() => (searchOpen ? closeSearch() : openSearch())}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      <button
        class="btn icon"
        type="button"
        aria-label={focus ? "Sair da tela cheia" : "Tela cheia"}
        title={focus ? "Sair da tela cheia" : "Tela cheia"}
        aria-pressed={focus}
        onclick={ontogglefocus}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#if focus}
            <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          {:else}
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          {/if}
        </svg>
      </button>
    </div>
  {/if}
</section>
