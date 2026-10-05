<script lang="ts">
  import { app } from "../app.svelte";

  let { onclick }: { onclick: () => void } = $props();

  const view = $derived.by(() => {
    const s = app.sync;
    const n = s.pending;
    const pend = n === 1 ? "1 pendente" : `${n} pendentes`;
    if (s.state === "auth") return { state: "auth", text: "Sessão expirada" };
    if (s.state === "offline") return { state: "offline", text: n ? `Offline · ${pend}` : "Offline" };
    if (s.state === "error") return { state: "error", text: "Erro ao sincronizar" };
    if (s.state === "syncing") return { state: "syncing", text: "Sincronizando…" };
    if (s.failed) return { state: "error", text: s.failed === 1 ? "1 recusada" : `${s.failed} recusadas` };
    if (n) return { state: "pending", text: pend };
    return { state: "ok", text: "Sincronizado" };
  });
</script>

<button class="syncbadge" type="button" data-state={view.state} {onclick} aria-live="polite" title="Sincronização: abrir dados e backup">
  <span class="sdot" aria-hidden="true"></span><span class="stext">{view.text}</span>
</button>
