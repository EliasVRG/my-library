<script lang="ts">
  import { emptyBookData, type Book } from "../../../shared/model";
  import type { SeriesEntry } from "../shelf";
  import Cover from "./Cover.svelte";

  // Uma coleção na estante: capa com o nome da coleção, empilhada sobre os outros volumes.
  let { entry, onopen }: { entry: SeriesEntry; onopen: () => void } = $props();

  const front = $derived<Book>({
    ...emptyBookData(),
    id: entry.key,
    title: entry.name,
    author: entry.author,
    category: entry.category,
    pdf_ready_key: null,
    created_at: 0,
    updated_at: 0,
    field_clock: {},
    rev: 0,
  });
  const pct = $derived(Math.round((100 * entry.read) / entry.books.length));
  const reading = $derived(entry.books.find((b) => b.status === "lendo"));
</script>

<button class="item stack" type="button" onclick={onopen} aria-label="Coleção {entry.name}: {entry.books.length} volumes, {entry.read} lidos">
  <span class="stack-covers" class:one={entry.books.length === 2}>
    <Cover book={front} plain />
  </span>
  <span class="below">
    <span class="prog" aria-hidden="true"><i style:width="{pct}%"></i></span>
    <span class="row">
      <span>{entry.books.length} volumes</span>
      <span class="mono">{entry.read}/{entry.books.length} lidos</span>
    </span>
    {#if reading}<span class="row stack-now">Lendo: {reading.title}</span>{/if}
  </span>
</button>
