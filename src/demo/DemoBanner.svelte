<script lang="ts">
  import { onMount } from "svelte";
  import { app, backend } from "../lib/app.svelte";

  let busy = $state(false);
  let done = $state(false);

  // Abre espaço no topo para a faixa (estante e mesa de leitura).
  onMount(() => {
    document.documentElement.classList.add("is-demo");
    return () => document.documentElement.classList.remove("is-demo");
  });

  async function restore() {
    if (!backend.restore) return;
    busy = true;
    try {
      await backend.restore(app.store);
      done = true;
      setTimeout(() => (done = false), 2500);
    } finally {
      busy = false;
    }
  }
</script>

<div class="demobar" role="note">
  <span class="dtext">
    <span class="long">Demonstração: seus dados ficam só neste navegador.</span>
    <span class="short" aria-hidden="true">Demo: dados só neste navegador.</span>
  </span>
  <span class="dacts">
    <a class="dlink" href="/demo/sync">Ver a sincronização</a>
    <button class="dbtn" type="button" onclick={restore} disabled={busy || !app.ready}>
      {busy ? "Restaurando…" : done ? "Exemplo restaurado" : "Restaurar exemplo"}
    </button>
  </span>
</div>

<style>
  .demobar {
    position: fixed; inset: 0 0 auto 0; z-index: 20; height: var(--demo-h);
    display: flex; align-items: center; justify-content: center; gap: 6px 14px; padding: 0 12px;
    background: var(--ink); color: var(--bg); font-size: 12px;
  }
  .dtext { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dacts { display: flex; gap: 10px; align-items: center; flex: none; }
  .dlink { color: inherit; opacity: 0.85; }
  .dbtn { border: 1px solid color-mix(in srgb, var(--bg) 40%, transparent); background: transparent; color: inherit; border-radius: 999px; padding: 2px 10px; font-size: 12px; }
  .dbtn:hover { border-color: var(--bg); }
  .dbtn:disabled { opacity: 0.6; }
  .dbtn:focus-visible, .dlink:focus-visible { outline-color: var(--bg); }
  .short { display: none; }
  @media (max-width: 560px) {
    .dlink { display: none; }
    .long { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .short { display: inline; }
  }
  :global(:root.is-demo) { --demo-h: 34px; }
  :global(.is-demo body) { padding-top: var(--demo-h); }
  :global(.is-demo .desk) { top: var(--demo-h); }
</style>
