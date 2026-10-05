<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Book, Review } from "../../shared/model";
  import DevicePanel from "./DevicePanel.svelte";
  import { createSimulation, type SimDevice } from "./sync-sim";
  import type { MemoryServer } from "./memory-server";

  let sim = $state.raw<{ server: MemoryServer; a: SimDevice; b: SimDevice } | null>(null);
  let serverBook = $state.raw<Book | undefined>(undefined);
  let serverReview = $state.raw<Review | undefined>(undefined);
  let rev = $state(0);
  let error = $state("");
  let poll: ReturnType<typeof setInterval>;

  const names = $derived(sim ? { [sim.a.store.deviceId]: sim.a.name, [sim.b.store.deviceId]: sim.b.name } : {});

  onMount(() => {
    document.title = "Sincronização · Estante (demo)";
    createSimulation()
      .then((s) => {
        sim = s;
        poll = setInterval(() => {
          serverBook = s.server.books.get(s.a.bookId);
          serverReview = s.server.reviews.get(s.a.bookId);
          rev = s.server.rev;
        }, 300);
      })
      .catch((e) => {
        console.error(e);
        error = "Não foi possível iniciar a simulação neste navegador.";
      });
  });
  onDestroy(() => {
    clearInterval(poll);
    sim?.a.stop();
    sim?.b.stop();
  });
</script>

<div class="wrap sync">
  <header class="shead">
    <a class="btn small ghost" href="/">← Estante</a>
    <h1>Sincronização</h1>
    <p class="lead">
      Dois aparelhos com o mesmo livro, cada um com seu IndexedDB e sua fila de saída. O código de sincronização e o
      merge por campo são os mesmos do app; só o servidor roda aqui no navegador.
    </p>
    <ol class="steps">
      <li>Deixe os dois offline.</li>
      <li>Escreva o resumo no computador e avance páginas no celular.</li>
      <li>Reconecte os dois. Cada campo fica com a escrita mais recente, sem uma apagar a outra.</li>
    </ol>
  </header>

  {#if error}
    <p class="err" role="alert">{error}</p>
  {:else if sim}
    <div class="devices">
      <DevicePanel device={sim.a} {names} />
      <DevicePanel device={sim.b} {names} />
    </div>
    <section class="server" aria-label="Servidor">
      <h2 class="label">Servidor <span class="mono">rev {rev}</span></h2>
      <dl>
        <dt>Página atual</dt>
        <dd class="mono">{serverBook?.current_page ?? "—"}</dd>
        <dt>Resumo</dt>
        <dd>{serverReview?.resumo || "—"}</dd>
      </dl>
    </section>
  {:else}
    <p class="sub">Preparando os dois aparelhos…</p>
  {/if}
</div>

<style>
  .sync { max-width: 980px; }
  .shead { display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px; align-items: flex-start; }
  h1 { font-family: var(--serif); font-weight: 400; font-size: 40px; line-height: 1; margin: 6px 0 0; }
  .lead { margin: 0; color: var(--muted); max-width: 62ch; }
  .steps { margin: 0; padding-left: 20px; color: var(--ink); font-size: 14px; display: flex; flex-direction: column; gap: 2px; }
  .devices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .server { margin-top: 20px; border-top: 1px solid var(--line); padding-top: 18px; }
  .server .label { margin-bottom: 10px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; font-size: 14px; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  @media (max-width: 700px) {
    .devices { grid-template-columns: minmax(0, 1fr); }
    h1 { font-size: 32px; }
  }
</style>
