import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScryfallCard } from "@/lib/scryfall-types";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  deckFindFirst: vi.fn(),
  getCardsByIds: vi.fn(),
  searchAndCacheCards: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/cards", () => ({ getCardsByIds: mocks.getCardsByIds, searchAndCacheCards: mocks.searchAndCacheCards }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findFirst: mocks.deckFindFirst },
    $queryRaw: async () => [{ count: 1, windowStart: new Date() }],
    rateLimit: { deleteMany: async () => ({ count: 0 }) },
  },
}));

import { GET } from "./route";

const fullCard = { id: "c1", name: "Sol Ring", cmc: 1, color_identity: [], purchase_uris: { tcgplayer: "x" }, tcgplayer_id: 1 } as unknown as ScryfallCard;
const search = async (params: Record<string, string>) => GET(new Request(`http://localhost/api/scryfall/search?${new URLSearchParams(params)}`));

describe("GET /api/scryfall/search", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.searchAndCacheCards.mockResolvedValue({ cards: [fullCard], hasMore: false, totalCards: 1 });
    // The deck's commander is black-green.
    mocks.deckFindFirst.mockResolvedValue({ cards: [{ scryfallId: "cmd" }] });
    mocks.getCardsByIds.mockResolvedValue(new Map([["cmd", { id: "cmd", color_identity: ["G", "B"] } as unknown as ScryfallCard]]));
  });

  it("lets the browser keep a plain search for a day", async () => {
    const res = await search({ q: "sol ring" });
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=86400");
    expect(await res.json()).toMatchObject({ hasMore: false, totalCards: 1 });
  });

  it("sends the cards trimmed to the fields the app reads", async () => {
    const { cards } = await (await search({ q: "sol ring" })).json();
    expect(cards[0]).toMatchObject({ id: "c1", name: "Sol Ring", cmc: 1 });
    expect(cards[0]).not.toHaveProperty("purchase_uris");
    expect(cards[0]).not.toHaveProperty("tcgplayer_id");
  });

  it("limits a deck's card search to its commander's colours, and lets the answer be kept when the browser agrees on them", async () => {
    const res = await search({ q: "draw", mode: "card", deckId: "deck-1", scope: "BG" });
    expect(mocks.searchAndCacheCards.mock.calls[0][0]).toBe("draw f:commander id<=BG");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=86400");
  });

  it("never keeps a deck's answer when the browser and server disagree about the colours", async () => {
    // e.g. the commander was just changed on screen and hasn't been saved yet
    expect((await search({ q: "draw", mode: "card", deckId: "deck-1", scope: "none" })).headers.get("Cache-Control")).toBe("no-store");
    // or a caller (like the Salt tab) that doesn't say
    expect((await search({ q: "draw", mode: "card", deckId: "deck-1" })).headers.get("Cache-Control")).toBe("no-store");
  });

  it("looks decks up only for their owner or a friend invited to them", async () => {
    await search({ q: "draw", mode: "card", deckId: "deck-1", scope: "BG" });
    expect(mocks.deckFindFirst.mock.calls[0][0].where).toEqual({ id: "deck-1", OR: [{ userId: "user-1" }, { collaborators: { some: { userId: "user-1" } } }] });
  });

  it("a deck with no commander yet has no colour limit, and its scope is 'none'", async () => {
    mocks.deckFindFirst.mockResolvedValue({ cards: [] });
    const res = await search({ q: "draw", mode: "card", deckId: "deck-1", scope: "none" });
    expect(mocks.searchAndCacheCards.mock.calls[0][0]).toBe("draw f:commander");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=86400");
  });

  it("never keeps an answer when the search itself failed", async () => {
    mocks.searchAndCacheCards.mockRejectedValue(new Error("Scryfall is down"));
    const res = await search({ q: "sol ring" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ cards: [], hasMore: false });
  });

  it("answers an empty search with nothing, and rejects anonymous requests", async () => {
    expect(await (await search({ q: "  " })).json()).toEqual({ cards: [], hasMore: false });
    mocks.auth.mockResolvedValue(null);
    expect((await search({ q: "sol ring" })).status).toBe(401);
  });
});
