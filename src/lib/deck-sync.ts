// Keeps the browser's copy of a deck and the server's in step while edits feel instant.
//
// Edits are applied locally first, then handed to `send`. Requests run one at a time in
// the order they were made (so "add" then "remove" can never arrive swapped), a failure
// is reported and triggers a reload from the server, and once the queue goes quiet the
// server's version of the deck is fetched once to correct any drift. That reload is thrown
// away if you edited again while it was in flight, so it can never undo a newer click.

export interface DeckSyncOptions<D> {
  fetchDeck: () => Promise<D | null>;
  applyServerDeck: (deck: D) => void;
  onError: (message: string) => void;
  quietMs?: number;
}

export class DeckSync<D> {
  private chain: Promise<void> = Promise.resolve();
  private inflight = 0;
  private version = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private readonly quietMs: number;

  constructor(private readonly options: DeckSyncOptions<D>) {
    this.quietMs = options.quietMs ?? 800;
  }

  // Queues a request. Anything it throws, or any non-2xx answer, is reported once.
  send(request: () => Promise<Response>, fallbackMessage: string): void {
    this.version++;
    this.inflight++;
    this.chain = this.chain.then(async () => {
      let failed = false;
      try {
        const res = await request();
        if (!res.ok) {
          failed = true;
          const body = await res.json().catch(() => null);
          this.options.onError(typeof body?.error === "string" ? body.error : fallbackMessage);
        }
      } catch {
        failed = true;
        this.options.onError(fallbackMessage);
      } finally {
        this.inflight--;
        // A failure means the local copy is wrong, so fix it straight away; otherwise wait for quiet.
        if (this.inflight === 0 || failed) this.reconcileSoon(failed);
      }
    });
  }

  // Marks the local copy as changed outside `send` (e.g. an edit that has no request yet).
  touch(): void {
    this.version++;
  }

  reconcileSoon(immediate = false): void {
    if (this.disposed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.reconcile(), immediate ? 0 : this.quietMs);
  }

  async reconcile(): Promise<void> {
    if (this.disposed || this.inflight > 0) return; // reschedules itself when the queue drains
    const startedAt = this.version;
    const deck = await this.options.fetchDeck().catch(() => null);
    if (!deck || this.disposed) return;
    if (startedAt !== this.version || this.inflight > 0) return; // edited meanwhile; a newer reload is coming
    this.options.applyServerDeck(deck);
  }

  // Waits for every queued request, then reloads. Use after changes the server made on its own.
  async refresh(): Promise<void> {
    await this.chain;
    clearTimeout(this.timer);
    await this.reconcile();
  }

  // React's strict mode mounts, unmounts and re-mounts a component in development, so a
  // disposed instance has to be able to come back to life.
  activate(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
  }
}
