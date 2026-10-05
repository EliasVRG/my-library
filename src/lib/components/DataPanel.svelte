<script lang="ts">
  import { app } from "../app.svelte";
  import { ImportError, buildExportData, buildZip, parseImport, type PdfForExport } from "../export/backup";
  import { formatBytes } from "../pdf/files";

  let { open = $bindable() }: { open: boolean } = $props();

  let dialog: HTMLDialogElement;
  let importInput: HTMLInputElement;
  let includePdfs = $state(false);
  let exporting = $state(false);
  let exportMsg = $state<{ ok: boolean; text: string } | null>(null);
  let importMsg = $state<{ ok: boolean; text: string } | null>(null);
  let freeMsg = $state("");

  $effect(() => {
    if (open && !dialog.open) {
      exportMsg = importMsg = null;
      freeMsg = "";
      dialog.showModal();
      void app.refresh();
    } else if (!open && dialog.open) dialog.close();
  });

  const offlineList = $derived(
    app.books
      .filter((b) => app.offline.has(b.id))
      .map((b) => ({ book: b, size: app.offline.get(b.id)! }))
      .sort((a, b) => b.size - a.size),
  );
  const pdfCount = $derived(app.books.filter((b) => b.pdf_key).length);
  const syncText = $derived.by(() => {
    const s = app.sync;
    if (s.state === "auth") return s.denied ? (s.error ?? "O servidor recusou o login.") : "Sessão do Cloudflare Access expirada.";
    if (s.state === "offline") return "Sem conexão. As alterações ficam guardadas neste aparelho.";
    if (s.state === "error") return `Último erro: ${s.error ?? "desconhecido"}. Vai tentar de novo sozinho.`;
    if (s.state === "syncing") return "Sincronizando agora…";
    return s.lastSync ? `Última sincronização às ${new Date(s.lastSync).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` : "Ainda não sincronizou nesta sessão.";
  });

  async function release(id: string) {
    freeMsg = (await app.files.release(id)) ? "" : "Esse PDF ainda não foi enviado; não dá para liberar agora.";
  }

  async function releaseAll() {
    const freed = await app.files.releaseAll();
    freeMsg = freed ? `${formatBytes(freed)} liberados. Os PDFs continuam na nuvem.` : "Nada para liberar.";
  }

  function download(bytes: Uint8Array, name: string) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function exportAll() {
    exporting = true;
    exportMsg = null;
    try {
      const books = await app.store.listBooks();
      const data = buildExportData(books, await app.store.listReviews());
      const pdfs: PdfForExport[] = [];
      const missing: string[] = [];
      if (includePdfs) {
        for (const book of books.filter((b) => b.pdf_key)) {
          try {
            const local = await app.files.local(book);
            const blob = local?.blob ?? (await app.files.download(book));
            pdfs.push({ book, data: new Uint8Array(await blob.arrayBuffer()) });
          } catch {
            missing.push(book.title);
          }
        }
      }
      const zip = buildZip(data, pdfs);
      download(zip, `estante-${new Date().toISOString().slice(0, 10)}.zip`);
      exportMsg = missing.length
        ? { ok: false, text: `Exportado, mas ${missing.length} PDF(s) não puderam ser incluídos (sem conexão?): ${missing.join(", ")}.` }
        : { ok: true, text: `Exportados ${data.books.length} livros${includePdfs ? ` e ${pdfs.length} PDFs` : ""}.` };
    } catch (e) {
      console.error(e);
      exportMsg = { ok: false, text: "Não foi possível exportar. Tente de novo." };
    } finally {
      exporting = false;
    }
  }

  async function importFile() {
    const f = importInput.files?.[0];
    importInput.value = "";
    if (!f) return;
    importMsg = null;
    try {
      const changes = parseImport(new Uint8Array(await f.arrayBuffer()));
      const n = await app.store.importChanges(changes);
      importMsg = { ok: true, text: n ? `${n} livro(s) criados ou atualizados. Vão sincronizar em seguida.` : "Nada novo: tudo do arquivo já estava aqui." };
    } catch (e) {
      importMsg = { ok: false, text: e instanceof ImportError ? e.message : "Não foi possível ler esse arquivo." };
    }
  }
</script>

<dialog
  class="sheet wide"
  bind:this={dialog}
  onclose={() => (open = false)}
  onclick={(e) => e.target === dialog && (open = false)}
  aria-labelledby="data-title"
>
  <div class="panel">
    <h2 id="data-title">Dados e backup</h2>

    <section aria-labelledby="h-sync">
      <h3 id="h-sync">Sincronização</h3>
      <p class="sub" role="status">{syncText}</p>
      {#if app.sync.pending}
        <p class="sub">{app.sync.pending} {app.sync.pending === 1 ? "item aguardando" : "itens aguardando"} envio.</p>
      {/if}
      {#if app.sync.failed}
        <p class="err">{app.sync.failed} alteração(ões) recusada(s) pelo servidor. Edite o livro de novo para reenviar.</p>
      {/if}
      <div class="acts-end" style="justify-content:flex-start">
        {#if app.sync.state === "auth"}
          <a class="btn small" href="/api/login">Entrar de novo</a>
        {:else}
          <button class="btn small" type="button" onclick={() => void app.engine.retryNow()} disabled={app.sync.state === "syncing"}>Sincronizar agora</button>
        {/if}
      </div>
    </section>
    <hr />

    <section aria-labelledby="h-storage">
      <h3 id="h-storage">Espaço neste aparelho</h3>
      <p class="sub">
        PDFs guardados: <b class="mono">{formatBytes(app.usedBytes)}</b> ({offlineList.length} de {pdfCount}).
        {#if app.quota}
          Livre para o app: <span class="mono">{formatBytes(Math.max(0, app.quota.quota - app.quota.usage))}</span>.
        {/if}
      </p>
      {#if app.quota}
        <div class="meter" role="img" aria-label="Uso do armazenamento: {Math.round((100 * app.quota.usage) / app.quota.quota)}%">
          <i style:width="{Math.min(100, (100 * app.quota.usage) / app.quota.quota)}%"></i>
        </div>
      {/if}
      {#if !app.persisted && app.usedBytes > 0}
        <p class="hint">
          O navegador pode apagar os PDFs guardados se faltar espaço.
          <button class="linkish" type="button" onclick={() => void app.ensurePersisted()}>Pedir armazenamento persistente</button>
          (instalar o app costuma garantir isso).
        </p>
      {/if}
      {#if offlineList.length}
        <ul class="filelist">
          {#each offlineList as { book, size } (book.id)}
            <li>
              <span class="name">{book.title}</span>
              <span class="mono hint">{formatBytes(size)}</span>
              <button class="btn small" type="button" onclick={() => release(book.id)}>Liberar</button>
            </li>
          {/each}
        </ul>
        <div><button class="btn small" type="button" onclick={releaseAll}>Liberar todos os já sincronizados</button></div>
      {/if}
      {#if freeMsg}<p class="ok" role="status">{freeMsg}</p>{/if}
    </section>
    <hr />

    <section aria-labelledby="h-export">
      <h3 id="h-export">Exportar tudo</h3>
      <p class="sub">Um .zip com uma resenha por livro em Markdown e o arquivo <code>estante.json</code> com todos os dados.</p>
      <label class="check"><input type="checkbox" bind:checked={includePdfs} /> Incluir os PDFs (o arquivo fica bem maior)</label>
      <div><button class="btn primary" type="button" onclick={exportAll} disabled={exporting}>{exporting ? "Preparando…" : "Exportar .zip"}</button></div>
      {#if exportMsg}<p class={exportMsg.ok ? "ok" : "err"} role="status">{exportMsg.text}</p>{/if}
    </section>
    <hr />

    <section aria-labelledby="h-import">
      <h3 id="h-import">Importar</h3>
      <p class="sub">
        Restaura um <code>estante.json</code> (ou o .zip exportado). Nada é apagado: cada campo fica com a versão mais recente,
        e livros excluídos não voltam.
      </p>
      <input bind:this={importInput} type="file" accept=".json,.zip,application/json,application/zip" hidden onchange={importFile} />
      <div><button class="btn" type="button" onclick={() => importInput.click()}>Escolher arquivo…</button></div>
      {#if importMsg}<p class={importMsg.ok ? "ok" : "err"} role="status">{importMsg.text}</p>{/if}
    </section>

    <div class="acts-end"><button class="btn" type="button" onclick={() => (open = false)}>Fechar</button></div>
  </div>
</dialog>
