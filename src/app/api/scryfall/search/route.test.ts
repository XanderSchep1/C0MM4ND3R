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

describe("GET /api/scryfall/search — commander pairs and companions", () => {
  const card = (name: string, extra: Partial<ScryfallCard> = {}) => ({ id: name, name, type_line: "Legendary Creature — Human", keywords: [], color_identity: [], ...extra }) as unknown as ScryfallCard;
  const will = card("Will Kenrith", { oracle_text: "Partner with Rowan Kenrith (...)", keywords: ["Partner with", "Partner"] });
  const rowan = card("Rowan Kenrith", { id: "rowan", oracle_text: "Partner with Will Kenrith (...)", keywords: ["Partner with", "Partner"] });
  const tymna = card("Tymna the Weaver", { oracle_text: "Partner (...)", keywords: ["Partner"] });
  const thrasios = card("Thrasios, Triton Hero", { oracle_text: "Partner (...)", keywords: ["Partner"] });
  const atraxa = card("Atraxa", { oracle_text: "Flying" });
  const known = new Map([will, rowan, tymna, thrasios, atraxa].map((c) => [c.id, c]));

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getCardsByIds.mockImplementation(async (ids: string[]) => new Map(ids.flatMap((id) => (known.has(id) ? [[id, known.get(id)!] as const] : []))));
  });

  const found = async (res: Response) => ((await res.json()).cards as ScryfallCard[]).map((c) => c.name);

  it("offers only what can pair with the first commander, searching for exactly that", async () => {
    mocks.searchAndCacheCards.mockResolvedValue({ cards: [rowan, tymna, will], hasMore: false, totalCards: 3 });
    const res = await search({ q: "kenrith", mode: "commander", partnerOf: "Will Kenrith" });
    expect(mocks.searchAndCacheCards.mock.calls[0][0]).toBe('kenrith f:commander !"Rowan Kenrith" (is:commander or t:background)');
    expect(await found(res)).toEqual(["Rowan Kenrith"]);
  });

  it("doesn't offer the first commander itself as its own partner (another printing of it included)", async () => {
    mocks.searchAndCacheCards.mockResolvedValue({ cards: [tymna, { ...tymna, id: "tymna-2" }, thrasios], hasMore: false, totalCards: 3 });
    expect(await found(await search({ q: "partner", mode: "commander", partnerOf: "Tymna the Weaver" }))).toEqual(["Thrasios, Triton Hero"]);
    expect(mocks.searchAndCacheCards.mock.calls[0][0]).toContain('keyword:partner -keyword:"partner with"');
  });

  it("has no restriction without a first commander, or when it has no pairing ability or isn't known", async () => {
    mocks.searchAndCacheCards.mockResolvedValue({ cards: [tymna, atraxa], hasMore: false, totalCards: 2 });
    const variants: Record<string, string>[] = [{}, { partnerOf: "Atraxa" }, { partnerOf: "no-such-card" }];
    for (const params of variants) {
      mocks.searchAndCacheCards.mockClear();
      expect(await found(await search({ q: "x", mode: "commander", ...params }))).toEqual(["Tymna the Weaver", "Atraxa"]);
      expect(mocks.searchAndCacheCards.mock.calls[0][0]).toBe("x f:commander (is:commander or t:background)");
    }
  });

  it("can be narrowed to one kind of pairing, and ignores a kind the card doesn't have", async () => {
    const amy = card("Amy Pond", { oracle_text: "Partner with Rory Williams (...)\nDoctor's companion", keywords: ["Partner with", "Doctor's companion"] });
    known.set(amy.id, amy);
    mocks.searchAndCacheCards.mockResolvedValue({ cards: [], hasMore: false, totalCards: 0 });
    await search({ q: "x", mode: "commander", partnerOf: "Amy Pond", via: "doctors-companion" });
    expect(mocks.searchAndCacheCards.mock.calls[0][0]).toBe('x f:commander t:"time lord doctor" (is:commander or t:background)');
    mocks.searchAndCacheCards.mockClear();
    await search({ q: "x", mode: "commander", partnerOf: "Amy Pond" });
    expect(mocks.searchAndCacheCards.mock.calls[0][0]).toBe('x f:commander (!"Rory Williams" or t:"time lord doctor") (is:commander or t:background)');
    mocks.searchAndCacheCards.mockClear();
    await search({ q: "x", mode: "commander", partnerOf: "Tymna the Weaver", via: "choose-a-background" });
    expect(mocks.searchAndCacheCards.mock.calls[0][0]).toBe("x f:commander (is:commander or t:background)");
  });

  it("lets the browser keep a partner search, since it depends on nothing but the request", async () => {
    mocks.searchAndCacheCards.mockResolvedValue({ cards: [rowan], hasMore: false, totalCards: 1 });
    expect((await search({ q: "kenrith", mode: "commander", partnerOf: "Will Kenrith" })).headers.get("Cache-Control")).toBe("private, max-age=86400");
  });

  it("searches companions within the commander's colours, and keeps the answer only when the colours agree", async () => {
    mocks.deckFindFirst.mockResolvedValue({ cards: [{ scryfallId: "cmd" }] });
    mocks.getCardsByIds.mockResolvedValue(new Map([["cmd", { id: "cmd", color_identity: ["G", "B"] } as unknown as ScryfallCard]]));
    mocks.searchAndCacheCards.mockResolvedValue({ cards: [], hasMore: false, totalCards: 0 });
    const res = await search({ q: "lurrus", mode: "companion", deckId: "deck-1", scope: "BG" });
    expect(mocks.searchAndCacheCards.mock.calls[0][0]).toBe("lurrus f:commander keyword:companion id<=BG");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=86400");
    expect((await search({ q: "lurrus", mode: "companion", deckId: "deck-1", scope: "none" })).headers.get("Cache-Control")).toBe("no-store");
  });

  it("offers every companion while the deck has no commander yet", async () => {
    mocks.deckFindFirst.mockResolvedValue({ cards: [] });
    mocks.searchAndCacheCards.mockResolvedValue({ cards: [], hasMore: false, totalCards: 0 });
    await search({ q: "lurrus", mode: "companion", deckId: "deck-1", scope: "none" });
    expect(mocks.searchAndCacheCards.mock.calls[0][0]).toBe("lurrus f:commander keyword:companion");
  });
});
