<script lang="ts">
  import { untrack } from "svelte";
  import type { Book, ReviewField } from "../../../shared/model";
  import { app } from "../app.svelte";
  import { saveFile } from "../download";
  import { buildStoryData, clipHighlight, hasDebate, HIGHLIGHT_MAX, STORY_MODEL_NAME, storyAlt } from "../story/data";
  import type { StoryModel, StoryTheme } from "../story/palette";
  import { storyPrefs } from "../story/prefs.svelte";
  import { renderStory, storyFileName } from "../story/render";

  let { book, open = $bindable() }: { book: Book; open: boolean } = $props();

  let dialog: HTMLDialogElement;

  const MODELS: { id: StoryModel; hint: string }[] = [
    { id: "destaque", hint: "Nota e um trecho da resenha" },
    { id: "concordo", hint: "Onde concordo, onde discordo e o outro lado" },
    { id: "terminei", hint: "Páginas, dias e a próxima leitura" },
  ];

  let model = $state<StoryModel>("destaque");
  let theme = $state<StoryTheme>(
    typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );

  const review = $derived(app.reviews.get(book.id));
  // Opções de trecho: os campos preenchidos da resenha (o texto escolhido é editável à parte).
  const options = $derived(buildStoryData(book, review, app.books).highlightOptions);
  let field = $state<ReviewField | "">("");
  let highlight = $state("");
  untrack(() => {
    const first = options[0];
    if (first) {
      field = first.field;
      highlight = clipHighlight(first.text);
    }
  });

  function pick(f: ReviewField) {
    field = f;
    const o = options.find((x) => x.field === f);
    if (o) highlight = clipHighlight(o.text);
  }

  const data = $derived(buildStoryData(book, review, app.books, { handle: storyPrefs.handle, highlight }));
  const debate = $derived(hasDebate(data));
  // Sem nenhum dos três campos, o modelo 2 fica indisponível.
  $effect(() => {
    if (!debate && model === "concordo") model = "destaque";
  });

  // Pré-gera a imagem sempre que algo muda: na hora do toque, `share` é chamado direto,
  // ainda dentro do gesto do usuário (o navegador exige isso).
  let file = $state<File | null>(null);
  let preview = $state("");
  let pending = $state(true);
  let error = $state("");
  let canShare = $state(false);
  let generation = 0;

  $effect(() => {
    const args = [model, $state.snapshot(data), theme] as const;
    const gen = ++generation;
    pending = true;
    error = "";
    // A primeira imagem sai na hora; as seguintes esperam a digitação parar.
    const delay = untrack(() => file) ? 250 : 0;
    const timer = setTimeout(async () => {
      try {
        const blob = await renderStory(...args);
        if (gen !== generation) return;
        const f = new File([blob], storyFileName(args[1].title, blob), { type: blob.type });
        if (preview) URL.revokeObjectURL(preview);
        preview = URL.createObjectURL(blob);
        file = f;
        canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [f] });
      } catch (e) {
        console.error(e);
        if (gen === generation) error = "Não foi possível gerar a imagem.";
      } finally {
        if (gen === generation) pending = false;
      }
    }, delay);
    return () => clearTimeout(timer);
  });

  $effect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  });

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  let shareMsg = $state("");
  function deliver() {
    if (!file || pending) return;
    shareMsg = "";
    if (canShare) {
      navigator.share({ files: [file] }).catch((e: unknown) => {
        // Fechar o menu de compartilhar não é erro.
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error(e);
        saveFile(file!, file!.name);
        shareMsg = "O compartilhamento falhou; a imagem foi para a pasta de downloads.";
      });
    } else {
      saveFile(file, file.name);
      shareMsg = "Imagem salva na pasta de downloads.";
    }
  }
</script>

<dialog
  class="sheet wide story"
  bind:this={dialog}
  onclose={() => (open = false)}
  onclick={(e) => e.target === dialog && (open = false)}
  aria-labelledby="story-title"
>
  <div class="panel">
    <div class="story-head">
      <h2 id="story-title">Compartilhar no story</h2>
      <button class="btn icon ghost" type="button" aria-label="Fechar" onclick={() => (open = false)}>✕</button>
    </div>

    <div class="story-body">
      <figure class="story-preview" aria-busy={pending}>
        {#if preview}
          <img src={preview} alt={storyAlt(model, data)} class:stale={pending} />
        {:else}
          <div class="story-ph" role="status">{error || "Gerando…"}</div>
        {/if}
      </figure>

      <div class="story-opts">
        <fieldset class="story-models">
          <legend class="label">Modelo</legend>
          {#each MODELS as m (m.id)}
            {@const off = m.id === "concordo" && !debate}
            <label class="mcard" class:off>
              <input type="radio" name="story-model" value={m.id} bind:group={model} disabled={off} />
              <span class="mname">{STORY_MODEL_NAME[m.id]}</span>
              <span class="hint">{off ? "Preencha “Onde concordo”, “Onde discordo” ou “Como o outro lado responderia” na resenha." : m.hint}</span>
            </label>
          {/each}
        </fieldset>

        <fieldset class="seg">
          <legend class="label">Tema</legend>
          <label><input type="radio" name="story-theme" value="light" bind:group={theme} /> Claro</label>
          <label><input type="radio" name="story-theme" value="dark" bind:group={theme} /> Escuro</label>
        </fieldset>

        {#if model === "destaque"}
          {#if options.length}
            <label class="f">
              Trecho em destaque
              <select value={field} onchange={(e) => pick(e.currentTarget.value as ReviewField)}>
                {#each options as o (o.field)}<option value={o.field}>{o.label}</option>{/each}
              </select>
            </label>
            <label class="f">
              <span class="row-between">
                Texto
                <span class="hint mono" aria-live="polite">{[...highlight].length}/{HIGHLIGHT_MAX}</span>
              </span>
              <textarea rows="4" maxlength={HIGHLIGHT_MAX} bind:value={highlight}></textarea>
            </label>
          {:else}
            <p class="hint">A resenha está vazia: o story sai com a capa e a nota, sem trecho.</p>
          {/if}
        {/if}

        {#if !storyPrefs.handle}
          <p class="hint">Para mostrar seu @ do Instagram, preencha em Dados e backup.</p>
        {/if}
      </div>
    </div>

    {#if error && preview}<p class="err" role="alert">{error}</p>{/if}
    {#if shareMsg}<p class="ok" role="status">{shareMsg}</p>{/if}
    <div class="acts-end">
      <button class="btn ghost" type="button" onclick={() => (open = false)}>Fechar</button>
      <button class="btn primary" type="button" disabled={!file || pending} onclick={deliver}>
        {pending && !file ? "Gerando…" : canShare ? "Compartilhar" : "Baixar imagem"}
      </button>
    </div>
  </div>
</dialog>
