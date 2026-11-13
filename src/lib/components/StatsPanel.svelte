<script lang="ts">
  import { app } from "../app.svelte";
  import { goalFor, setGoal } from "../goal.svelte";
  import { goalPace, MONTHS, statYears, yearStats } from "../stats";
  import { readingDays } from "../story/data";

  let { open = $bindable() }: { open: boolean } = $props();

  let dialog: HTMLDialogElement;
  const now = Date.now();
  const thisYear = new Date(now).getFullYear();
  let year = $state(thisYear);

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  const years = $derived(statYears(app.books, now));
  const s = $derived(yearStats(app.books, year));
  const goal = $derived(goalFor(year));
  const pace = $derived(goal ? goalPace(s.count, goal, year, now) : null);
  const maxMonth = $derived(Math.max(1, ...s.byMonth));
  // Os meses de pico ganham o número em cima; os outros, na dica (e na lista abaixo).
  const peak = $derived(s.count ? Math.max(...s.byMonth) : -1);
  const maxCat = $derived(Math.max(1, ...s.categories.map(([, n]) => n)));
  const monthName = (i: number) => new Date(2000, i, 1).toLocaleDateString("pt-BR", { month: "long" });
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const dateFmt = (ms: number) => `${new Date(ms).getDate()} ${MONTHS[new Date(ms).getMonth()]}`;

  let goalDraft = $state("");
  $effect(() => {
    goalDraft = goal ? String(goal) : "";
  });
  function saveGoal() {
    const n = parseInt(goalDraft, 10);
    setGoal(year, Number.isFinite(n) && n > 0 ? n : null);
  }

  const paceText = $derived.by(() => {
    if (!pace || !goal) return "";
    const left = goal - s.count;
    switch (pace.state) {
      case "batida":
        return s.count > goal ? `Meta batida, com ${s.count - goal} a mais.` : "Meta batida.";
      case "encerrado":
        return `Faltaram ${left} para a meta.`;
      case "adiantado":
        return `${pace.diff} ${pace.diff === 1 ? "livro" : "livros"} à frente do ritmo. Faltam ${left}.`;
      case "no ritmo":
        return `No ritmo. Faltam ${left}${pace.perMonthLeft ? `, cerca de ${fmt(pace.perMonthLeft)} por mês` : ""}.`;
      case "atrasado":
        return `${-pace.diff} ${pace.diff === -1 ? "livro" : "livros"} atrás do ritmo. Faltam ${left}, cerca de ${fmt(pace.perMonthLeft ?? left)} por mês.`;
    }
  });

  // Dica das barras (hover e foco): mostra o valor do mês.
  let tip = $state<{ i: number; x: number } | null>(null);
  const tipAt = (i: number, el: HTMLElement) => (tip = { i, x: el.offsetLeft + el.offsetWidth / 2 });
</script>

<dialog
  class="sheet wide stats"
  bind:this={dialog}
  onclose={() => (open = false)}
  onclick={(e) => e.target === dialog && (open = false)}
  aria-labelledby="stats-title"
>
  <div class="panel">
    <div class="stats-head">
      <h2 id="stats-title">Leitura em</h2>
      <select class="seg" aria-label="Ano" bind:value={year}>
        {#each years as y (y)}<option value={y}>{y}</option>{/each}
      </select>
      <button class="btn icon ghost" type="button" aria-label="Fechar" onclick={() => (open = false)}>✕</button>
    </div>

    <section class="goalbox" aria-labelledby="goal-h">
      <div class="goal-row">
        <h3 id="goal-h">Meta</h3>
        <form class="goal-form" onsubmit={(e) => (e.preventDefault(), saveGoal())}>
          <label>
            <span class="sr-only">Meta de livros para {year}</span>
            <input inputmode="numeric" placeholder="—" bind:value={goalDraft} onblur={saveGoal} autocomplete="off" />
          </label>
          <span class="hint">livros em {year}</span>
        </form>
      </div>
      {#if goal}
        <div
          class="meter"
          role="meter"
          aria-valuemin="0"
          aria-valuemax={goal}
          aria-valuenow={Math.min(s.count, goal)}
          aria-label="Meta de {year}: {s.count} de {goal} livros"
        >
          <i style:width="{Math.min(100, pace!.done * 100)}%"></i>
          {#if pace!.state !== "batida" && pace!.state !== "encerrado" && pace!.expected > 0}
            <b class="pace-mark" style:left="{Math.min(100, (100 * pace!.expected) / goal)}%" title="Esperado até hoje: {pace!.expected}"></b>
          {/if}
        </div>
        <p class="sub"><b class="mono">{s.count}</b> de <span class="mono">{goal}</span>. {paceText}</p>
      {:else}
        <p class="hint">Defina quantos livros quer ler em {year}. A meta fica neste aparelho e aparece no story “Terminei de ler”.</p>
      {/if}
    </section>

    <div class="kpis">
      <div class="kpi"><span class="kl">Livros lidos</span><span class="kv">{fmt(s.count)}</span></div>
      <div class="kpi"><span class="kl">Páginas</span><span class="kv">{fmt(s.pages)}</span></div>
      <div class="kpi">
        <span class="kl">Média por livro</span>
        <span class="kv">{s.avgDays == null ? "—" : `${fmt(s.avgDays)} ${s.avgDays === 1 ? "dia" : "dias"}`}</span>
      </div>
    </div>

    {#if s.count}
      <section aria-labelledby="months-h">
        <h3 id="months-h">Livros por mês</h3>
        <div class="months" role="group" aria-labelledby="months-h">
          {#each s.byMonth as n, i (i)}
            <button
              class="mcol"
              type="button"
              aria-label="{monthName(i)}: {n} {n === 1 ? 'livro' : 'livros'}"
              onpointerenter={(e) => tipAt(i, e.currentTarget)}
              onpointerleave={() => (tip = null)}
              onfocus={(e) => tipAt(i, e.currentTarget)}
              onblur={() => (tip = null)}
            >
              <span class="mbar-slot">
                {#if n === peak}<span class="mval mono" style:bottom="calc({(100 * n) / maxMonth}% + 4px)">{n}</span>{/if}
                {#if n}<span class="mbar" class:hot={tip?.i === i} style:height="{(100 * n) / maxMonth}%"></span>{/if}
              </span>
              <span class="mlbl" aria-hidden="true">{MONTHS[i]}</span>
            </button>
          {/each}
          {#if tip}
            <div class="mtip" class:edge-l={tip.i < 2} class:edge-r={tip.i > 9} style:left="{tip.x}px" aria-hidden="true">
              <b class="mono">{s.byMonth[tip.i]}</b> <span>{s.byMonth[tip.i] === 1 ? "livro" : "livros"} em {monthName(tip.i)}</span>
            </div>
          {/if}
        </div>
      </section>

      <section aria-labelledby="cats-h">
        <h3 id="cats-h">Categorias</h3>
        <ul class="hbars">
          {#each s.categories.slice(0, 6) as [c, n] (c)}
            <li>
              <span class="hb-name">{c}</span>
              <span class="hb-track"><span class="hb-bar" style:width="{(100 * n) / maxCat}%"></span><span class="hb-val mono">{n}</span></span>
            </li>
          {/each}
        </ul>
        {#if s.categories.length > 6}<p class="hint">E mais {s.categories.length - 6} categorias com menos livros.</p>{/if}
      </section>

      <section aria-labelledby="list-h">
        <h3 id="list-h">Terminados em {year}</h3>
        <ol class="donelist">
          {#each s.books as b (b.id)}
            {@const d = readingDays(b)}
            <li>
              <span class="mono hint">{dateFmt(b.finished_at!)}</span>
              <span class="dl-title">{b.title}</span>
              <span class="hint">{b.pages ? `${fmt(b.pages)} págs` : ""}{b.pages && d ? " · " : ""}{d ? `${d} ${d === 1 ? "dia" : "dias"}` : ""}</span>
            </li>
          {/each}
        </ol>
      </section>
    {:else}
      <p class="sub">Nenhum livro terminado em {year} ainda.</p>
    {/if}

    {#if s.undated}
      <p class="hint">
        {s.undated} {s.undated === 1 ? "livro marcado como lido não tem" : "livros marcados como lidos não têm"} data de término e
        não {s.undated === 1 ? "entra" : "entram"} aqui. Dá para preencher a data no painel do livro.
      </p>
    {/if}
  </div>
</dialog>
