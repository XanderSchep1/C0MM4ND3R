import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeckSync } from "./deck-sync";

type Deck = { cards: string[] };

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const fail = (status = 400, error?: string) => new Response(JSON.stringify(error ? { error } : {}), { status });

function setup(server: { current: Deck }, opts: { fetchDelay?: () => Promise<void> } = {}) {
  const applied: Deck[] = [];
  const errors: string[] = [];
  const sync = new DeckSync<Deck>({
    fetchDeck: async () => {
      const snapshot = { cards: [...server.current.cards] };
      await opts.fetchDelay?.();
      return snapshot;
    },
    applyServerDeck: (d) => applied.push(d),
    onError: (m) => errors.push(m),
    quietMs: 800,
  });
  return { sync, applied, errors };
}

describe("DeckSync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs requests one at a time, in the order they were made", async () => {
    const server = { current: { cards: [] as string[] } };
    const { sync } = setup(server);
    const log: string[] = [];
    const slow = (label: string, ms: number) => async () => {
      log.push(`start ${label}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${label}`);
      return ok();
    };
    sync.send(slow("add", 300), "x");
    sync.send(slow("remove", 10), "x");
    await vi.advanceTimersByTimeAsync(1000);
    expect(log).toEqual(["start add", "end add", "start remove", "end remove"]);
  });

  it("reloads from the server once, after things go quiet", async () => {
    const server = { current: { cards: ["a", "b"] } };
    const { sync, applied } = setup(server);
    sync.send(async () => ok(), "x");
    sync.send(async () => ok(), "x");
    sync.send(async () => ok(), "x");
    await vi.advanceTimersByTimeAsync(799);
    expect(applied).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(applied).toEqual([{ cards: ["a", "b"] }]);
  });

  it("reports the server's message and reloads straight away when a request fails", async () => {
    const server = { current: { cards: ["a"] } };
    const { sync, applied, errors } = setup(server);
    sync.send(async () => fail(400, "A deck can hold at most 400 different cards."), "fallback");
    await vi.advanceTimersByTimeAsync(5);
    expect(errors).toEqual(["A deck can hold at most 400 different cards."]);
    expect(applied).toEqual([{ cards: ["a"] }]);
  });

  it("uses the fallback message for network errors and errors without a body", async () => {
    const server = { current: { cards: [] as string[] } };
    const { sync, errors } = setup(server);
    sync.send(async () => { throw new Error("offline"); }, "Couldn't save that change.");
    sync.send(async () => fail(500), "Couldn't add the card.");
    await vi.advanceTimersByTimeAsync(5);
    expect(errors).toEqual(["Couldn't save that change.", "Couldn't add the card."]);
  });

  it("throws away a reload that was overtaken by a newer edit", async () => {
    const server = { current: { cards: ["old"] } };
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { sync, applied } = setup(server, { fetchDelay: () => gate });
    sync.send(async () => ok(), "x");
    await vi.advanceTimersByTimeAsync(900); // reload starts and hangs on the gate
    sync.send(async () => ok(), "x"); // the user clicks again while it is in flight
    await vi.advanceTimersByTimeAsync(5);
    release();
    await vi.advanceTimersByTimeAsync(5);
    expect(applied).toHaveLength(0); // the stale snapshot must not overwrite the newer click
    server.current = { cards: ["new"] };
    await vi.advanceTimersByTimeAsync(1000); // quiet again: the next reload is the one that counts
    expect(applied).toEqual([{ cards: ["new"] }]);
  });

  it("does not reload while requests are still running", async () => {
    const server = { current: { cards: [] as string[] } };
    const { sync, applied } = setup(server);
    sync.send(() => new Promise<Response>((r) => setTimeout(() => r(ok()), 5000)), "x");
    await sync.reconcile();
    await vi.advanceTimersByTimeAsync(4000);
    expect(applied).toHaveLength(0);
  });

  it("refresh() waits for queued requests before reloading", async () => {
    const server = { current: { cards: ["a"] } };
    const { sync, applied } = setup(server);
    sync.send(async () => { await new Promise((r) => setTimeout(r, 200)); server.current = { cards: ["a", "b"] }; return ok(); }, "x");
    const done = sync.refresh();
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(applied.at(-1)).toEqual({ cards: ["a", "b"] });
  });

  it("works again after dispose() then activate() (React strict mode remounts)", async () => {
    const server = { current: { cards: ["a"] } };
    const { sync, applied } = setup(server);
    sync.dispose();
    sync.activate();
    sync.send(async () => ok(), "x");
    await vi.advanceTimersByTimeAsync(1000);
    expect(applied).toEqual([{ cards: ["a"] }]);
  });

  it("stops doing anything after dispose()", async () => {
    const server = { current: { cards: ["a"] } };
    const { sync, applied } = setup(server);
    sync.send(async () => ok(), "x");
    sync.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(applied).toHaveLength(0);
  });
});
