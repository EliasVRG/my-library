<script lang="ts">
  import { app } from "../app.svelte";

  let { onclick }: { onclick: () => void } = $props();

  const view = $derived.by(() => {
    const s = app.sync;
    const n = s.pending;
    const pend = n === 1 ? "1 alteração pendente" : `${n} alterações pendentes`;
    if (s.state === "auth") return { state: "auth", text: "Sessão expirada" };
    if (s.state === "offline") return { state: "offline", text: n ? `Offline · ${pend}` : "Offline" };
    if (s.state === "error") return { state: "error", text: "Erro ao sincronizar" };
    if (s.state === "syncing") return { state: "syncing", text: "Sincronizando…" };
    if (s.failed) return { state: "error", text: s.failed === 1 ? "1 alteração recusada" : `${s.failed} alterações recusadas` };
    if (n) return { state: "pending", text: pend };
    return { state: "ok", text: "Sincronizado" };
  });
</script>

<button class="syncbadge" type="button" data-state={view.state} {onclick} aria-live="polite">
  <span class="dot" aria-hidden="true"></span>{view.text}
</button>
