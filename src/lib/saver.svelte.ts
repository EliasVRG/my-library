// Agrupa escritas rápidas (digitação, páginas viradas) antes de gravar no IndexedDB,
// e expõe o estado para o indicador "Editando…" / "Salvo".

export class Saver {
  pending = $state(0);
  touched = $state(false);
  failed = $state(false);
  private timers = new Map<string, { t: ReturnType<typeof setTimeout>; run: () => Promise<unknown> }>();

  has(key: string): boolean {
    return this.timers.has(key);
  }

  queue(key: string, run: () => Promise<unknown>, delay = 600): void {
    const prev = this.timers.get(key);
    if (prev) clearTimeout(prev.t);
    const t = setTimeout(() => void this.fire(key), delay);
    this.timers.set(key, { t, run });
    this.pending = this.timers.size;
    this.touched = true;
  }

  async now(run: () => Promise<unknown>): Promise<void> {
    this.touched = true;
    try {
      await run();
      this.failed = false;
    } catch (e) {
      console.error(e);
      this.failed = true;
    }
  }

  private async fire(key: string): Promise<void> {
    const job = this.timers.get(key);
    if (!job) return;
    this.timers.delete(key);
    clearTimeout(job.t);
    await this.now(job.run);
    this.pending = this.timers.size;
  }

  flush(): Promise<void[]> {
    return Promise.all([...this.timers.keys()].map((k) => this.fire(k)));
  }

  cancel(): void {
    for (const { t } of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.pending = 0;
  }
}
