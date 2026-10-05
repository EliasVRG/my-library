<script lang="ts">
  import { STATUS_LABEL, pdfState, type Book } from "../../../shared/model";
  import { app, catColor } from "../app.svelte";

  let { book, onopen }: { book: Book; onopen: () => void } = $props();

  const pct = $derived(
    book.pages ? Math.round((100 * (book.status === "lido" ? book.pages : book.current_page || 1)) / book.pages) : 0,
  );
  const pdf = $derived(pdfState(book));
  const upload = $derived(app.sync.uploads.get(book.id));
  const isOffline = $derived(app.offline.has(book.id));
  const waitingUpload = $derived(pdf === "uploading" && isOffline);
</script>

<button class="book" type="button" style:--cat={catColor(book.category)} onclick={onopen}>
  <span class="spine"></span>
  <span class="in">
    <span class="cat">{book.category || "Sem categoria"}</span>
    <h3>{book.title}</h3>
    <span class="author">{book.author}</span>
    <span class="meta">
      {#if book.pages}
        <span class="bar" aria-hidden="true"><i style:width="{pct}%"></i></span>
      {/if}
      <span class="row">
        {#if pdf === "none"}
          <span>Sem PDF</span>
        {:else if book.pages}
          <span class="mono" aria-label="Página {book.current_page || 1} de {book.pages}">p. {book.current_page || 1} / {book.pages}</span>
        {:else}
          <span>PDF anexado</span>
        {/if}
        <span class="pill {book.status}">{STATUS_LABEL[book.status] ?? ""}</span>
      </span>
      {#if pdf !== "none" || book.rating}
        <span class="row">
          {#if upload !== undefined}
            <span class="off wait">Enviando PDF {Math.round(upload * 100)}%</span>
          {:else if waitingUpload}
            <span class="off wait">PDF aguardando envio</span>
          {:else if pdf === "uploading"}
            <span class="off wait">PDF ainda subindo de outro aparelho</span>
          {:else if isOffline}
            <span class="off">Disponível offline</span>
          {:else}
            <span></span>
          {/if}
          {#if book.rating}
            <span class="stars" aria-label="Nota {book.rating} de 5">{"★".repeat(book.rating)}{"☆".repeat(5 - book.rating)}</span>
          {/if}
        </span>
      {/if}
    </span>
  </span>
</button>
