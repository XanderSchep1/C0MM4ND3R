import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScryfallCard } from "@/lib/scryfall-types";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  deckFindFirst: vi.fn(),
  deckCardFindMany: vi.fn(),
  deckCardUpsert: vi.fn(),
  deckCardDeleteMany: vi.fn(),
  transaction: vi.fn(),
  executeRaw: vi.fn(),
  cardFindFirst: vi.fn(),
  getCardsCollection: vi.fn(),
  getCardByNameFuzzy: vi.fn(),
  resolveCardsByNames: vi.fn(),
}));
const real = vi.hoisted(() => ({ resolveCardsByNames: undefined as undefined | typeof import("@/lib/cards").resolveCardsByNames }));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/scryfall", () => ({ getCardsCollection: mocks.getCardsCollection, getCardByNameFuzzy: mocks.getCardByNameFuzzy, searchCards: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findFirst: mocks.deckFindFirst },
    deckCard: { findMany: mocks.deckCardFindMany, upsert: mocks.deckCardUpsert, deleteMany: mocks.deckCardDeleteMany },
    cardCache: { findFirst: mocks.cardFindFirst },
    $transaction: mocks.transaction,
    $executeRaw: mocks.executeRaw,
    $queryRaw: async () => [{ count: 1, windowStart: new Date() }],
    rateLimit: { deleteMany: async () => ({ count: 0 }) },
  },
}));
// The real resolver by default, so a list goes through the same name matching as in production; a test can swap in its own.
vi.mock("@/lib/cards", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/cards")>();
  real.resolveCardsByNames = actual.resolveCardsByNames;
  return { ...actual, resolveCardsByNames: mocks.resolveCardsByNames };
});

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "deck-1" }) };
const importText = async (text: string) =>
  (await POST(new Request("http://localhost/api/decks/deck-1/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }), context)) as Response;

const card = (id: string, name: string, faces: string[] = []) => ({ id, name, card_faces: faces.map((face) => ({ name: face })) }) as unknown as ScryfallCard;
const delver = card("delver", "Delver of Secrets // Insectile Aberration", ["Delver of Secrets", "Insectile Aberration"]);
const valki = card("valki", "Valki, God of Lies // Tibalt, Cosmic Impostor", ["Valki, God of Lies", "Tibalt, Cosmic Impostor"]);
const solRing = card("sol-ring", "Sol Ring");

const upserted = () => mocks.deckCardUpsert.mock.calls.map(([args]) => ({ scryfallId: args.create.scryfallId, name: args.create.name, zone: args.create.zone, quantity: args.create.quantity }));

describe("POST /api/decks/[id]/import", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.deckFindFirst.mockResolvedValue({ id: "deck-1" });
    mocks.deckCardFindMany.mockResolvedValue([]);
    mocks.deckCardUpsert.mockImplementation((args) => args);
    mocks.transaction.mockResolvedValue([]);
    mocks.executeRaw.mockResolvedValue(1);
    mocks.cardFindFirst.mockResolvedValue(null);
    mocks.getCardByNameFuzzy.mockResolvedValue(null);
    mocks.resolveCardsByNames.mockImplementation((names: string[]) => real.resolveCardsByNames!(names));
  });

  it("adds a double-faced card listed by its front face alone", async () => {
    mocks.getCardsCollection.mockResolvedValue({ found: [delver, valki], notFound: [] });
    const res = await importText("Deck\n1 Delver of Secrets\n2 Valki, God of Lies");
    expect(await res.json()).toEqual({ added: 3, unresolved: [] });
    expect(upserted()).toEqual([
      { scryfallId: "delver", name: "Delver of Secrets // Insectile Aberration", zone: "mainboard", quantity: 1 },
      { scryfallId: "valki", name: "Valki, God of Lies // Tibalt, Cosmic Impostor", zone: "mainboard", quantity: 2 },
    ]);
  });

  it("still adds one listed by its full name, and folds the same card listed both ways into one row", async () => {
    mocks.getCardsCollection.mockResolvedValue({ found: [delver], notFound: [] });
    const res = await importText("1 Delver of Secrets // Insectile Aberration\n3 Delver of Secrets");
    expect(await res.json()).toEqual({ added: 4, unresolved: [] });
    expect(upserted()).toEqual([{ scryfallId: "delver", name: "Delver of Secrets // Insectile Aberration", zone: "mainboard", quantity: 4 }]);
  });

  it("names a card Scryfall doesn't know in `unresolved`, and still adds the rest", async () => {
    mocks.getCardsCollection.mockResolvedValue({ found: [solRing], notFound: [{ name: "Not A Real Card" }] });
    const res = await importText("1 Sol Ring\n1 Not A Real Card");
    expect(await res.json()).toEqual({ added: 1, unresolved: ["Not A Real Card"] });
    expect(upserted().map((row) => row.scryfallId)).toEqual(["sol-ring"]);
  });

  it("reports any line that ends up with no card rather than dropping it without a word", async () => {
    mocks.resolveCardsByNames.mockResolvedValue({ resolved: new Map([["Sol Ring", solRing]]), unresolved: [] });
    const res = await importText("1 Sol Ring\n1 Delver of Secrets\n1 Delver of Secrets");
    expect(await res.json()).toEqual({ added: 1, unresolved: ["Delver of Secrets"] });
    expect(upserted().map((row) => row.scryfallId)).toEqual(["sol-ring"]);
  });

  it("lists each unmatched name once even when the resolver already reported it", async () => {
    mocks.resolveCardsByNames.mockResolvedValue({ resolved: new Map(), unresolved: ["Delver of Secrets"] });
    const res = await importText("1 Delver of Secrets\n1 Valki, God of Lies");
    expect(await res.json()).toEqual({ added: 0, unresolved: ["Delver of Secrets", "Valki, God of Lies"] });
  });
});
