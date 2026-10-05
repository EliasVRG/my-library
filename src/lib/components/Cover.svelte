<script lang="ts">
  import { pdfState, type Book } from "../../../shared/model";
  import { app, catColor } from "../app.svelte";

  // Capa 2:3 desenhada com a cor da categoria. `small` é a versão da faixa "Continuar lendo".
  let { book, small = false }: { book: Book; small?: boolean } = $props();

  const pdf = $derived(pdfState(book));
  const upload = $derived(app.sync.uploads.get(book.id));
  const local = $derived(app.offline.has(book.id));

  // Selo no canto: situação do arquivo (sem PDF, envio pendente, disponível offline).
  const badge = $derived.by((): { text: string; title: string; quiet?: boolean } | null => {
    if (small) return null;
    if (pdf === "none") return { text: "sem PDF", title: "Sem PDF" };
    if (pdf === "uploading" && upload !== undefined) return { text: `${Math.round(upload * 100)}%`, title: "Enviando o PDF", quiet: true };
    if (pdf === "uploading" && local) return { text: "na fila", title: "PDF guardado neste aparelho, aguardando envio", quiet: true };
    if (pdf === "uploading") return { text: "subindo", title: "PDF ainda subindo de outro aparelho", quiet: true };
    if (local) return { text: "offline", title: "Disponível offline", quiet: true };
    return null;
  });
</script>

<span class="cover" class:small style:--cat={catColor(book.category)} aria-hidden={small ? "true" : undefined}>
  <span class="chead">
    <span class="ck">{book.category}</span>
    {#if badge}
      <span class="badge" class:quiet={badge.quiet} title={badge.title}>
        {badge.text}<span class="sr-only">: {badge.title}</span>
      </span>
    {/if}
  </span>
  <span class="ct">{book.title}</span>
  <span class="ca">{book.author}</span>
</span>
