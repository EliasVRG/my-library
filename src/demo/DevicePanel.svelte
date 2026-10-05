<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { Clock } from "../../shared/model";
  import type { DeviceView, SimDevice } from "./sync-sim";

  let { device, names }: { device: SimDevice; names: Record<string, string> } = $props();

  let view = $state.raw<DeviceView | null>(null);
  let online = $state(true);
  let draft = $state("");
  let area = $state<HTMLTextAreaElement>();

  // O painel é criado uma vez por aparelho; o `device` não muda.
  const off = untrack(() => device).onView((v) => {
    view = v;
    if (document.activeElement !== area) draft = v.review?.resumo ?? "";
  });
  onDestroy(off);

  const book = $derived(view?.book);
  const page = $derived(book?.current_page ?? 1);
  const statusText = $derived.by(() => {
    if (!online) return view?.pending ? `Offline · ${view.pending} na fila` : "Offline";
    if (view?.status.state === "syncing") return "Sincronizando…";
    return view?.pending ? `${view.pending} na fila` : "Em dia com o servidor";
  });

  function who(c: Clock | undefined): string {
    if (!c) return "—";
    const t = new Date(c[0]).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${t} · ${names[c[1]] ?? "outro"}`;
  }

  function turn(delta: number) {
    if (!book) return;
    const n = Math.min(Math.max(1, page + delta), book.pages || 9999);
    void device.store.updateBook(book.id, { current_page: n });
  }

  async function toggle() {
    online = !online;
    await device.setOnline(online);
  }
</script>

<section class="device" class:offline={!online} aria-label={device.name}>
  <header>
    <h2>{device.name}</h2>
    <button class="btn small" class:primary={!online} type="button" aria-pressed={!online} onclick={toggle}>
      {online ? "Ficar offline" : "Reconectar"}
    </button>
  </header>
  <p class="dstate" role="status"><span class="sd" aria-hidden="true"></span>{statusText}</p>

  {#if book}
    <div class="field">
      <span class="flabel">Página atual</span>
      <div class="pager">
        <button class="btn icon" type="button" aria-label="Página anterior ({device.name})" onclick={() => turn(-1)}>‹</button>
        <span class="mono pnum">{page} <span class="of">de {book.pages}</span></span>
        <button class="btn icon" type="button" aria-label="Próxima página ({device.name})" onclick={() => turn(1)}>›</button>
      </div>
      <span class="clock mono">{who(book.field_clock.current_page)}</span>
    </div>

    <label class="field">
      <span class="flabel">Resumo da resenha</span>
      <textarea
        bind:this={area}
        rows="3"
        placeholder="Escreva algo aqui"
        value={draft}
        oninput={(e) => {
          draft = e.currentTarget.value;
          void device.store.updateReview(book.id, { resumo: draft });
        }}
      ></textarea>
      <span class="clock mono">{who(view?.review?.field_clock.resumo)}</span>
    </label>
  {:else}
    <p class="sub">Carregando…</p>
  {/if}
</section>

<style>
  .device { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 14px; min-width: 0; transition: border-color 0.15s; }
  .device.offline { border-color: var(--warn); border-style: dashed; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  h2 { font-family: var(--serif); font-weight: 400; font-size: 26px; margin: 0; line-height: 1; }
  .dstate { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 13px; color: var(--muted); }
  .sd { width: 7px; height: 7px; border-radius: 50%; background: var(--ink); }
  .offline .sd { background: var(--warn); }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .flabel { font-size: 12px; font-weight: 500; color: var(--muted); }
  .pager { display: flex; align-items: center; gap: 8px; }
  .pnum { font-size: 22px; min-width: 96px; text-align: center; }
  .of { font-size: 13px; color: var(--muted); }
  textarea { border: 0; border-bottom: 1px solid var(--line); background: transparent; padding: 4px 0 8px; resize: vertical; line-height: 1.5; font-size: 16px; }
  textarea:focus { outline: none; border-color: var(--ink); }
  textarea:focus-visible { box-shadow: 0 1px 0 0 var(--accent); }
  .clock { font-size: 11px; color: var(--muted); }
</style>
