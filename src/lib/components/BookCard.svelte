<script lang="ts">
  import { STATUS_LABEL, type Book } from "../../../shared/model";
  import { progress } from "../app.svelte";
  import Cover from "./Cover.svelte";

  let { book, onopen }: { book: Book; onopen: () => void } = $props();

  const started = $derived(book.pages > 0 && book.status !== "quero");
  const pct = $derived(progress(book));
</script>

<button class="item" type="button" onclick={onopen}>
  <Cover {book} />
  <span class="below">
    {#if started}
      <span class="prog" aria-hidden="true"><i style:width="{pct}%"></i></span>
    {/if}
    <span class="row">
      <span class="dot {book.status}">{STATUS_LABEL[book.status] ?? ""}</span>
      {#if book.rating}
        <span class="stars" aria-label="Nota {book.rating} de 5">{"★".repeat(book.rating)}</span>
      {:else if started}
        <span class="mono" aria-label="{pct}% lido">{pct}%</span>
      {/if}
    </span>
  </span>
</button>
