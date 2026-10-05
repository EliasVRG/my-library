<script lang="ts">
  import { tick } from "svelte";
  import type { Book, Status } from "../../../shared/model";
  import { app } from "../app.svelte";
  import { formatBytes } from "../pdf/files";

  type Request = { mode: "new" } | { mode: "attach"; book: Book } | null;
  let { request = $bindable() }: { request: Request } = $props();

  let dialog: HTMLDialogElement;
  let fileInput: HTMLInputElement;
  let titleInput = $state<HTMLInputElement>();
  let pickButton = $state<HTMLButtonElement>();

  let file = $state<File | null>(null);
  let title = $state("");
  let author = $state("");
  let category = $state("");
  let status = $state<Status>("quero");
  let error = $state("");
  let busy = $state(false);
  let over = $state(false);

  const attach = $derived(request?.mode === "attach" ? request.book : null);

  $effect(() => {
    if (request && !dialog.open) {
      file = null;
      title = author = category = "";
      status = "quero";
      error = "";
      busy = false;
      if (fileInput) fileInput.value = "";
      dialog.showModal();
      void tick().then(() => (attach ? pickButton : titleInput)?.focus());
    } else if (!request && dialog.open) {
      dialog.close();
    }
  });

  async function take(f: File | undefined | null) {
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
      error = "Escolha um arquivo PDF.";
      return;
    }
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.usage !== undefined && f.size > est.quota - est.usage) {
      error = `Esse PDF tem ${formatBytes(f.size)}, mas só há ${formatBytes(est.quota - est.usage)} livres neste aparelho. Libere espaço em "Dados e backup".`;
      return;
    }
    error = "";
    file = f;
    if (!title) title = f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!attach && !title.trim()) {
      error = "Dê um título ao livro.";
      titleInput?.focus();
      return;
    }
    if (attach && !file) {
      error = "Escolha o PDF para anexar.";
      return;
    }
    busy = true;
    try {
      if (attach) await app.store.attachPdf(attach.id, file!);
      else await app.store.createBook({ title, author, category, status, file: file ?? undefined });
      if (file) void app.ensurePersisted();
      request = null;
    } catch (err) {
      console.error(err);
      error =
        err instanceof DOMException && err.name === "QuotaExceededError"
          ? "Não há espaço neste aparelho para guardar esse PDF. Libere espaço em \"Dados e backup\"."
          : "Não foi possível salvar. Tente de novo.";
    } finally {
      busy = false;
    }
  }
</script>

<dialog class="sheet" bind:this={dialog} onclose={() => (request = null)} aria-labelledby="sheet-title">
  <form class="panel" onsubmit={submit} novalidate>
    <h2 id="sheet-title">{attach ? "Anexar PDF" : "Novo livro"}</h2>
    {#if attach}<p class="sub">{attach.title}</p>{/if}
    <div
      class="drop"
      class:over
      role="group"
      aria-label="Arquivo PDF"
      ondragover={(e) => {
        e.preventDefault();
        over = true;
      }}
      ondragleave={() => (over = false)}
      ondrop={(e) => {
        e.preventDefault();
        over = false;
        void take(e.dataTransfer?.files[0]);
      }}
    >
      <input bind:this={fileInput} type="file" accept="application/pdf,.pdf" hidden onchange={() => void take(fileInput.files?.[0])} />
      {#if file}
        <strong>{file.name}</strong><br />
        <span class="hint mono">{formatBytes(file.size)}</span> ·
        <button type="button" class="btn small" bind:this={pickButton} onclick={() => fileInput.click()}>trocar</button>
      {:else}
        Arraste o PDF aqui ou
        <button type="button" class="btn small" bind:this={pickButton} onclick={() => fileInput.click()}>escolher arquivo</button><br />
        <span class="hint">
          Fica guardado neste aparelho e sobe para a nuvem quando houver conexão.{attach ? "" : " Pode adicionar o PDF depois."}
        </span>
      {/if}
    </div>
    {#if !attach}
      <label class="f">Título<input bind:this={titleInput} bind:value={title} required autocomplete="off" /></label>
      <label class="f">Autor<input bind:value={author} autocomplete="off" /></label>
      <div class="two">
        <label class="f">Categoria<input bind:value={category} list="catList" placeholder="ex.: Economia" autocomplete="off" /></label>
        <label class="f">
          Situação
          <select bind:value={status}>
            <option value="quero">Quero ler</option>
            <option value="lendo">Lendo</option>
            <option value="pausado">Pausado</option>
            <option value="lido">Lido</option>
          </select>
        </label>
      </div>
    {/if}
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <div class="acts-end">
      <button type="button" class="btn ghost" onclick={() => (request = null)}>Cancelar</button>
      <button type="submit" class="btn primary" disabled={busy}>
        {busy ? "Salvando…" : attach ? "Anexar" : "Salvar na estante"}
      </button>
    </div>
  </form>
</dialog>
