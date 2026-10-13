import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScryfallCard } from "./scryfall-types";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  executeRaw: vi.fn(),
  searchFind: vi.fn(),
  searchUpsert: vi.fn(),
  searchCards: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("./scryfall", () => ({ searchCards: mocks.searchCards, getCardsCollection: vi.fn(), getCardByNameFuzzy: vi.fn() }));
vi.mock("./prisma", () => ({
  prisma: { $executeRaw: mocks.executeRaw, searchCache: { findUnique: mocks.searchFind, upsert: mocks.searchUpsert }, cardCache: { findMany: vi.fn() } },
}));

import { searchAndCacheCards } from "./cards";

const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, name: `Card ${i}` }) as ScryfallCard);
const answer = (data: ScryfallCard[]) => ({ object: "list", has_more: false, total_cards: data.length, data });

describe("searchAndCacheCards on a miss", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.searchFind.mockResolvedValue(null);
    mocks.executeRaw.mockResolvedValue(1);
    mocks.searchUpsert.mockResolvedValue({});
  });

  it("answers before anything is written, then remembers it after the response", async () => {
    mocks.searchCards.mockResolvedValue(answer(cards(3)));
    let later: (() => Promise<unknown>) | undefined;
    mocks.after.mockImplementation((task) => void (later = task));

    const result = await searchAndCacheCards("sol ring");
    expect(result.cards).toHaveLength(3);
    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.searchUpsert).not.toHaveBeenCalled();

    await later!();
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.searchUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.searchUpsert.mock.calls[0][0].create.cardIds).toEqual(["id-0", "id-1", "id-2"]);
  });

  it("writes a page of cards in a few multi-row statements, not one per card", async () => {
    mocks.searchCards.mockResolvedValue(answer([...cards(120), cards(1)[0]])); // 121 results, one a repeat of id-0
    mocks.after.mockImplementation((task) => void task());
    await searchAndCacheCards("t:artifact");
    await vi.waitFor(() => expect(mocks.searchUpsert).toHaveBeenCalled());
    expect(mocks.executeRaw).toHaveBeenCalledTimes(3); // 50 + 50 + 20 unique cards
    const ids = mocks.executeRaw.mock.calls.map((call) => call[1] as string[]);
    expect(ids.map((batch) => batch.length)).toEqual([50, 50, 20]);
    expect(new Set(ids.flat()).size).toBe(120);
  });

  it("outside a request (where there is nothing to run after) writes before returning", async () => {
    mocks.searchCards.mockResolvedValue(answer(cards(2)));
    mocks.after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    await searchAndCacheCards("sol ring");
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.searchUpsert).toHaveBeenCalledTimes(1);
  });

  it("a failed cache write never breaks the search", async () => {
    mocks.searchCards.mockResolvedValue(answer(cards(2)));
    mocks.executeRaw.mockRejectedValue(new Error("database is down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let later: (() => Promise<unknown>) | undefined;
    mocks.after.mockImplementation((task) => void (later = task));

    const result = await searchAndCacheCards("sol ring");
    expect(result.cards).toHaveLength(2);
    await expect(later!()).resolves.toBeUndefined();
    expect(mocks.searchUpsert).not.toHaveBeenCalled(); // the search is only remembered if its cards were
    log.mockRestore();
  });
});
