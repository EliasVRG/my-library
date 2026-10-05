<script lang="ts">
  import { STATUS_LABEL, pdfState } from "../../../shared/model";
  import { app, progress } from "../app.svelte";
  import Cover from "./Cover.svelte";

  let { onopen }: { onopen: (id: string) => void } = $props();

  // Até 3 livros em Lendo/Pausado, os mexidos mais recentemente primeiro.
  const reading = $derived(
    app.books
      .filter((b) => b.status === "lendo" || b.status === "pausado")
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, 3),
  );
</script>

{#if reading.length}
  <section class="continue" aria-labelledby="continue-h">
    <h2 class="label" id="continue-h">Continuar lendo</h2>
    <div class="crow">
      {#each reading as book (book.id)}
        <button class="ccard" type="button" onclick={() => onopen(book.id)}>
          <Cover {book} small />
          <span class="cinfo">
            <span class="h">{book.title}</span>
            <span class="author">{book.author}</span>
            <span class="foot">
              {#if book.pages}
                <span class="prog" aria-hidden="true"><i style:width="{progress(book)}%"></i></span>
                <span class="pmeta">
                  <span class="mono">p. {book.current_page || 1} de {book.pages}</span>
                  <span class="mono">{progress(book)}%</span>
                </span>
              {:else}
                <span class="pmeta">
                  <span>{pdfState(book) === "none" ? "Sem PDF ainda" : "Abrir para começar"}</span>
                  <span>{STATUS_LABEL[book.status]}</span>
                </span>
              {/if}
            </span>
          </span>
        </button>
      {/each}
    </div>
  </section>
{/if}
