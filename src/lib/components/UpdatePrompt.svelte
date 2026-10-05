<script lang="ts">
  import { useRegisterSW } from "virtual:pwa-register/svelte";

  // Nova versão do app: pergunta antes de recarregar, para não interromper uma leitura.
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
    },
  });

  $effect(() => {
    if (!$offlineReady) return;
    const t = setTimeout(() => offlineReady.set(false), 6000);
    return () => clearTimeout(t);
  });
</script>

{#if $needRefresh}
  <div class="toast" role="status">
    <span>Nova versão disponível.</span>
    <button class="btn" type="button" onclick={() => updateServiceWorker(true)}>Atualizar</button>
    <button class="btn ghost" type="button" style="color:inherit" onclick={() => needRefresh.set(false)}>Depois</button>
  </div>
{:else if $offlineReady}
  <div class="toast" role="status">
    <span>Pronto para funcionar offline.</span>
    <button class="btn ghost" type="button" style="color:inherit" onclick={() => offlineReady.set(false)}>Ok</button>
  </div>
{/if}
