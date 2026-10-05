<script lang="ts">
  import { onMount } from "svelte";
  import type { Book } from "../shared/model";
  import { app } from "./lib/app.svelte";
  import AddSheet from "./lib/components/AddSheet.svelte";
  import DataPanel from "./lib/components/DataPanel.svelte";
  import Desk from "./lib/components/Desk.svelte";
  import Shelf from "./lib/components/Shelf.svelte";
  import SyncBadge from "./lib/components/SyncBadge.svelte";
  import UpdatePrompt from "./lib/components/UpdatePrompt.svelte";

  // Rota simples pelo hash: #/livro/<id> abre a mesa de leitura (o botão voltar do celular fecha).
  const parse = () => /^#\/livro\/([0-9a-f-]{36})$/i.exec(location.hash)?.[1] ?? null;
  let openId = $state<string | null>(parse());
  const openBook = $derived(openId ? (app.books.find((b) => b.id === openId) ?? null) : null);

  let sheet = $state<{ mode: "new" } | { mode: "attach"; book: Book } | null>(null);
  let dataOpen = $state(false);

  onMount(() => {
    void app.init();
    const sync = () => (openId = parse());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  });

  function open(id: string) {
    history.pushState({ desk: true }, "", `#/livro/${id}`);
    openId = id;
  }

  function close() {
    if (history.state?.desk) history.back();
    else {
      history.replaceState(null, "", location.pathname + location.search);
      openId = null;
    }
  }

  $effect(() => {
    document.body.style.overflow = openBook ? "hidden" : "";
  });

  // Livro excluído em outro aparelho enquanto estava aberto aqui: volta para a estante.
  $effect(() => {
    if (app.ready && openId && !openBook) {
      history.replaceState(null, "", location.pathname + location.search);
      openId = null;
    }
  });
</script>

<div class="wrap" inert={!!openBook}>
  <header class="top">
    <div>
      <h1>Estante de Leitura</h1>
      <p class="sub">Seus PDFs, a página onde você parou e suas resenhas, num lugar só.</p>
    </div>
    <div class="acts">
      <SyncBadge onclick={() => (dataOpen = true)} />
      <button class="btn" type="button" onclick={() => (dataOpen = true)}>Dados e backup</button>
      <button class="btn primary" type="button" onclick={() => (sheet = { mode: "new" })} disabled={!app.ready}>Adicionar livro</button>
    </div>
  </header>

  {#if app.fatal}
    <div class="notice warn" role="alert">{app.fatal}</div>
  {:else if app.sync.state === "auth"}
    <div class="notice warn" role="status">
      <span>Sua sessão expirou. Suas alterações estão salvas neste aparelho e sobem assim que você entrar de novo.</span>
      <a class="btn small" href="/api/login">Entrar de novo</a>
    </div>
  {/if}

  {#if !app.ready && !app.fatal}
    <div class="empty"><p>Abrindo sua estante…</p></div>
  {:else if app.ready}
    <Shelf onopen={open} onadd={() => (sheet = { mode: "new" })} />
  {/if}
</div>

{#if openBook}
  {#key openBook.id}
    <Desk book={openBook} onclose={close} onattach={(book) => (sheet = { mode: "attach", book })} />
  {/key}
{/if}

<datalist id="catList">
  {#each app.categories as c (c)}<option value={c}></option>{/each}
</datalist>

<AddSheet bind:request={sheet} />
<DataPanel bind:open={dataOpen} />
<UpdatePrompt />
