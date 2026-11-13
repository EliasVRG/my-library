<script lang="ts">
  // Lista de nomes (categorias ou coleções) com renomear; renomear para um nome que já existe junta os dois.
  let {
    items,
    noun,
    onrename,
  }: { items: [string, number][]; noun: string; onrename: (from: string, to: string) => Promise<number> } = $props();

  let editing = $state<string | null>(null);
  let draft = $state("");
  let busy = $state(false);
  let msg = $state<{ ok: boolean; text: string } | null>(null);

  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt");
  const target = $derived(editing ? items.find(([n]) => n !== editing && norm(n) === norm(draft))?.[0] : undefined);

  function start(name: string) {
    editing = name;
    draft = name;
    msg = null;
  }

  async function save() {
    const from = editing;
    // Lido antes de salvar: depois, o nome novo já existe na lista e pareceria uma junção.
    const merging = !!target;
    const to = (target ?? draft).trim().replace(/\s+/g, " ");
    if (!from || !to || to === from) {
      editing = null;
      return;
    }
    busy = true;
    try {
      const n = await onrename(from, to);
      msg = { ok: true, text: merging ? `“${from}” juntou-se a “${to}” (${n} ${n === 1 ? "livro" : "livros"}).` : `Renomeado para “${to}” em ${n} ${n === 1 ? "livro" : "livros"}.` };
      editing = null;
    } catch (e) {
      console.error(e);
      msg = { ok: false, text: "Não foi possível salvar agora. Tente de novo." };
    } finally {
      busy = false;
    }
  }
</script>

{#if items.length}
  <ul class="filelist renames">
    {#each items as [name, n] (name)}
      <li>
        {#if editing === name}
          <form class="rename-form" onsubmit={(e) => (e.preventDefault(), void save())}>
            <label class="sr-only" for="rn-{noun}">Novo nome para {name}</label>
            <!-- svelte-ignore a11y_autofocus -->
            <input id="rn-{noun}" bind:value={draft} autofocus autocomplete="off" onkeydown={(e) => e.key === "Escape" && (editing = null)} />
            <button class="btn small primary" type="submit" disabled={busy || !draft.trim()}>{target ? "Juntar" : "Salvar"}</button>
            <button class="btn small ghost" type="button" onclick={() => (editing = null)}>Cancelar</button>
            {#if target}<span class="hint">Já existe “{target}”: {n === 1 ? "o livro vai" : `os ${n} livros vão`} para lá.</span>{/if}
          </form>
        {:else}
          <span class="name">{name}</span>
          <span class="mono hint">{n}</span>
          <button class="btn small" type="button" aria-label="Renomear {noun} {name}" onclick={() => start(name)}>Renomear</button>
        {/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="hint">Nenhuma {noun} ainda.</p>
{/if}
{#if msg}<p class={msg.ok ? "ok" : "err"} role="status">{msg.text}</p>{/if}
