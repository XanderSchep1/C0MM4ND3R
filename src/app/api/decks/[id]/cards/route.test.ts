import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  deckFindFirst: vi.fn(),
  cardFindUnique: vi.fn(),
  cardUpdate: vi.fn(),
  cardUpsert: vi.fn(),
  cardDelete: vi.fn(),
  cardCreate: vi.fn(),
  cardFindFirst: vi.fn(),
  cardDeleteMany: vi.fn(),
  cardCount: vi.fn(),
  transaction: vi.fn(),
  getCardsByIds: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/cards", () => ({ getCardsByIds: mocks.getCardsByIds }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findFirst: mocks.deckFindFirst },
    deckCard: {
      findUnique: mocks.cardFindUnique,
      findFirst: mocks.cardFindFirst,
      update: mocks.cardUpdate,
      upsert: mocks.cardUpsert,
      delete: mocks.cardDelete,
      create: mocks.cardCreate,
      deleteMany: mocks.cardDeleteMany,
      count: mocks.cardCount,
    },
    $transaction: mocks.transaction,
    $queryRaw: async () => [{ count: 1, windowStart: new Date() }],
    rateLimit: { deleteMany: async () => ({ count: 0 }) },
  },
}));

import { DELETE, PATCH, POST } from "./route";

const context = { params: Promise.resolve({ id: "deck-1" }) };
// (The handler's inferred type includes undefined only because of how it narrows its auth result.)
const patch = async (body: unknown) =>
  (await PATCH(new Request("http://localhost/api/decks/deck-1/cards", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), context)) as Response;
const key = (zone: string) => ({ deckId_scryfallId_zone: { deckId: "deck-1", scryfallId: "card-1", zone } });

describe("PATCH /api/decks/[id]/cards — highlight marks", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.deckFindFirst.mockResolvedValue({ id: "deck-1", userId: "user-1" });
    mocks.cardFindUnique.mockResolvedValue({ name: "Sol Ring", quantity: 2, zone: "mainboard", mark: null });
    mocks.transaction.mockResolvedValue([]);
    mocks.getCardsByIds.mockResolvedValue(new Map());
    mocks.cardCount.mockResolvedValue(0);
  });

  it("sets a mark without touching quantity or zone", async () => {
    const res = await patch({ scryfallId: "card-1", zone: "mainboard", mark: "owned" });
    expect(res.status).toBe(200);
    expect(mocks.cardUpdate).toHaveBeenCalledWith({ where: key("mainboard"), data: { mark: "owned" } });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("clears a mark with null", async () => {
    await patch({ scryfallId: "card-1", zone: "mainboard", mark: null });
    expect(mocks.cardUpdate).toHaveBeenCalledWith({ where: key("mainboard"), data: { mark: null } });
  });

  it("rejects values that are not a mark", async () => {
    for (const mark of ["purple", "null", 5]) {
      const res = await patch({ scryfallId: "card-1", zone: "mainboard", mark });
      expect(res.status, String(mark)).toBe(400);
    }
    expect(mocks.cardUpdate).not.toHaveBeenCalled();
  });

  it("does not let one account mark cards in someone else's deck", async () => {
    mocks.deckFindFirst.mockResolvedValue(null);
    const res = await patch({ scryfallId: "card-1", zone: "mainboard", mark: "owned" });
    expect(res.status).toBe(404);
    expect(mocks.deckFindFirst.mock.calls[0][0].where).toEqual({ id: "deck-1", OR: [{ userId: "user-1" }, { collaborators: { some: { userId: "user-1" } } }] });
    expect(mocks.cardUpdate).not.toHaveBeenCalled();
  });

  it("keeps the mark when a card moves to another zone", async () => {
    mocks.cardFindUnique
      .mockResolvedValueOnce({ name: "Sol Ring", quantity: 1, zone: "mainboard", mark: "missing" }) // the card being moved
      .mockResolvedValueOnce(null); // nothing in the target zone yet
    const res = await patch({ scryfallId: "card-1", zone: "mainboard", newZone: "maybeboard" });
    expect(res.status).toBe(200);
    expect(mocks.cardUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ zone: "maybeboard", mark: "missing" }) }));
  });

  describe("choosing art (printingId)", () => {
    const cardsFor = (current: object, next: object | null) => new Map<string, object>([["card-1", current], ...(next ? ([["card-2", next]] as [string, object][]) : [])]);
    const sol = (id: string, oracle = "oracle-sol") => ({ id, name: "Sol Ring", oracle_id: oracle });

    it("points the line at another printing of the same card", async () => {
      mocks.getCardsByIds.mockResolvedValue(cardsFor(sol("card-1"), sol("card-2")));
      mocks.cardFindUnique.mockResolvedValueOnce({ name: "Sol Ring", quantity: 1, zone: "mainboard", mark: null }).mockResolvedValueOnce(null);
      const res = await patch({ scryfallId: "card-1", zone: "mainboard", printingId: "card-2" });
      expect(res.status).toBe(200);
      expect(mocks.cardUpdate).toHaveBeenCalledWith({ where: key("mainboard"), data: { scryfallId: "card-2" } });
    });

    it("folds into the line that already uses that printing", async () => {
      mocks.getCardsByIds.mockResolvedValue(cardsFor(sol("card-1"), sol("card-2")));
      mocks.cardFindUnique.mockResolvedValueOnce({ name: "Sol Ring", quantity: 2, zone: "mainboard", mark: null }).mockResolvedValueOnce({ quantity: 1, mark: "owned" });
      const res = await patch({ scryfallId: "card-1", zone: "mainboard", printingId: "card-2" });
      expect(res.status).toBe(200);
      expect(mocks.transaction).toHaveBeenCalledOnce();
      expect(mocks.cardUpdate).toHaveBeenCalledWith({ where: { deckId_scryfallId_zone: { deckId: "deck-1", scryfallId: "card-2", zone: "mainboard" } }, data: { quantity: 3 } });
    });

    it("refuses a printing of a different card", async () => {
      mocks.getCardsByIds.mockResolvedValue(cardsFor(sol("card-1"), sol("card-2", "oracle-other")));
      const res = await patch({ scryfallId: "card-1", zone: "mainboard", printingId: "card-2" });
      expect(res.status).toBe(400);
      expect(mocks.cardUpdate).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("refuses a printing that doesn't exist, or a missing id", async () => {
      mocks.getCardsByIds.mockResolvedValue(cardsFor(sol("card-1"), null));
      expect((await patch({ scryfallId: "card-1", zone: "mainboard", printingId: "card-2" })).status).toBe(400);
      expect((await patch({ scryfallId: "card-1", zone: "mainboard", printingId: "" })).status).toBe(400);
      expect(mocks.cardUpdate).not.toHaveBeenCalled();
    });

    it("does nothing when the printing is already the one in the deck", async () => {
      const res = await patch({ scryfallId: "card-1", zone: "mainboard", printingId: "card-1" });
      expect(res.status).toBe(200);
      expect(mocks.cardUpdate).not.toHaveBeenCalled();
    });
  });
});

// ---- friends invited to a deck ------------------------------------------------------------------

const post = async (body: unknown) =>
  (await POST(new Request("http://localhost/api/decks/deck-1/cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), context)) as Response;
const del = async (query: string) => (await DELETE(new Request(`http://localhost/api/decks/deck-1/cards?${query}`, { method: "DELETE" }), context)) as Response;

describe("a friend invited to the deck (contributor)", () => {
  const sol = { id: "card-1", name: "Sol Ring", oracle_id: "oracle-sol" };

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "friend-1" } });
    mocks.deckFindFirst.mockResolvedValue({ id: "deck-1", userId: "owner-9" }); // not their deck: they were invited
    mocks.getCardsByIds.mockResolvedValue(new Map([["card-1", sol]]));
    mocks.cardCount.mockResolvedValue(0);
    mocks.cardFindFirst.mockResolvedValue(null);
    mocks.transaction.mockResolvedValue([]);
  });

  it("suggests a card: it goes in the Maybeboard, one copy, tagged with who added it", async () => {
    const res = await post({ scryfallId: "card-1", zone: "maybeboard", quantity: 40 });
    expect(res.status).toBe(201);
    expect(mocks.cardCreate).toHaveBeenCalledWith({ data: { deckId: "deck-1", scryfallId: "card-1", name: "Sol Ring", zone: "maybeboard", quantity: 1, addedById: "friend-1" } });
    expect(mocks.cardUpsert).not.toHaveBeenCalled();
  });

  it("can't add to the Mainboard or the commander slot", async () => {
    for (const zone of ["mainboard", "commander"]) {
      const res = await post({ scryfallId: "card-1", zone });
      expect(res.status, zone).toBe(403);
    }
    expect(mocks.cardCreate).not.toHaveBeenCalled();
  });

  it("can't suggest a card the deck already has, in any printing or zone", async () => {
    mocks.cardFindFirst.mockResolvedValue({ id: "existing" });
    const res = await post({ scryfallId: "card-1" });
    expect(res.status).toBe(409);
    expect(mocks.cardFindFirst.mock.calls[0][0].where).toEqual({ deckId: "deck-1", name: "Sol Ring" });
    expect(mocks.cardCreate).not.toHaveBeenCalled();
  });

  it("is stopped from burying the owner in suggestions", async () => {
    mocks.cardCount.mockResolvedValueOnce(60);
    const res = await post({ scryfallId: "card-1" });
    expect(res.status).toBe(400);
    expect(mocks.cardCount.mock.calls[0][0].where).toEqual({ deckId: "deck-1", addedById: "friend-1" });
    expect(mocks.cardCreate).not.toHaveBeenCalled();
  });

  it("can change the number of a card they suggested, and nothing else of the owner's", async () => {
    mocks.cardFindUnique.mockResolvedValue({ name: "Sol Ring", quantity: 1, zone: "maybeboard", mark: null, addedById: "friend-1" });
    expect((await patch({ scryfallId: "card-1", zone: "maybeboard", quantity: 2 })).status).toBe(200);
    expect(mocks.cardUpdate).toHaveBeenCalledWith({ where: key("maybeboard"), data: { quantity: 2 } });
  });

  it("can't touch a card the owner or another friend put there", async () => {
    mocks.cardFindUnique.mockResolvedValue({ name: "Sol Ring", quantity: 1, zone: "maybeboard", mark: null, addedById: "someone-else" });
    expect((await patch({ scryfallId: "card-1", zone: "maybeboard", quantity: 2 })).status).toBe(403);
    mocks.cardFindUnique.mockResolvedValue({ name: "Sol Ring", quantity: 1, zone: "maybeboard", mark: null, addedById: null });
    expect((await patch({ scryfallId: "card-1", zone: "maybeboard", quantity: 2 })).status).toBe(403);
    expect(mocks.cardUpdate).not.toHaveBeenCalled();
  });

  it("can't touch the Mainboard, even a card with the same id", async () => {
    mocks.cardFindUnique.mockResolvedValue({ name: "Sol Ring", quantity: 1, zone: "mainboard", mark: null, addedById: null });
    expect((await patch({ scryfallId: "card-1", zone: "mainboard", quantity: 5 })).status).toBe(403);
    expect(mocks.cardUpdate).not.toHaveBeenCalled();
  });

  it("can't highlight, move, or change art, which are the owner's", async () => {
    mocks.cardFindUnique.mockResolvedValue({ name: "Sol Ring", quantity: 1, zone: "maybeboard", mark: null, addedById: "friend-1" });
    for (const body of [{ mark: "owned" }, { newZone: "mainboard" }, { printingId: "card-2" }]) {
      expect((await patch({ scryfallId: "card-1", zone: "maybeboard", ...body })).status, JSON.stringify(body)).toBe(403);
    }
    expect(mocks.cardUpdate).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("can remove their own suggestion, and only theirs", async () => {
    mocks.cardDeleteMany.mockResolvedValueOnce({ count: 1 });
    expect((await del("scryfallId=card-1&zone=maybeboard")).status).toBe(200);
    expect(mocks.cardDeleteMany).toHaveBeenCalledWith({ where: { deckId: "deck-1", scryfallId: "card-1", zone: "maybeboard", addedById: "friend-1" } });

    mocks.cardDeleteMany.mockResolvedValueOnce({ count: 0 }); // not theirs
    expect((await del("scryfallId=card-1&zone=maybeboard")).status).toBe(403);
  });

  it("can't remove anything from the Mainboard", async () => {
    expect((await del("scryfallId=card-1&zone=mainboard")).status).toBe(403);
    expect((await del("scryfallId=card-1")).status).toBe(403); // the zone defaults to mainboard
    expect(mocks.cardDeleteMany).not.toHaveBeenCalled();
  });

  it("a stranger (not the owner, not invited) gets a plain 404 for everything", async () => {
    mocks.deckFindFirst.mockResolvedValue(null);
    expect((await post({ scryfallId: "card-1" })).status).toBe(404);
    expect((await patch({ scryfallId: "card-1", zone: "maybeboard", quantity: 2 })).status).toBe(404);
    expect((await del("scryfallId=card-1&zone=maybeboard")).status).toBe(404);
  });
});

describe("the owner dealing with a friend's suggestions", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "owner-9" } });
    mocks.deckFindFirst.mockResolvedValue({ id: "deck-1", userId: "owner-9" });
    mocks.cardCount.mockResolvedValue(0);
    mocks.transaction.mockResolvedValue([]);
  });

  it("accepting (moving it out of the Maybeboard) makes it the owner's own card", async () => {
    mocks.cardFindUnique
      .mockResolvedValueOnce({ name: "Sol Ring", quantity: 1, zone: "maybeboard", mark: null, addedById: "friend-1" })
      .mockResolvedValueOnce(null);
    expect((await patch({ scryfallId: "card-1", zone: "maybeboard", newZone: "mainboard" })).status).toBe(200);
    expect(mocks.cardUpsert.mock.calls[0][0].create).toMatchObject({ zone: "mainboard", addedById: null });
  });

  it("moving a card back into the Maybeboard keeps who suggested it", async () => {
    mocks.cardFindUnique
      .mockResolvedValueOnce({ name: "Sol Ring", quantity: 1, zone: "mainboard", mark: null, addedById: null })
      .mockResolvedValueOnce(null);
    await patch({ scryfallId: "card-1", zone: "mainboard", newZone: "maybeboard" });
    expect(mocks.cardUpsert.mock.calls[0][0].create).toMatchObject({ zone: "maybeboard", addedById: null });
  });

  it("adding a card a friend already suggested adopts it", async () => {
    mocks.getCardsByIds.mockResolvedValue(new Map([["card-1", { id: "card-1", name: "Sol Ring", oracle_id: "o" }]]));
    mocks.cardFindUnique.mockResolvedValue({ quantity: 1, addedById: "friend-1" });
    expect((await post({ scryfallId: "card-1", zone: "maybeboard" })).status).toBe(201);
    expect(mocks.cardUpsert.mock.calls[0][0].update).toEqual({ quantity: 2, addedById: null });
  });

  it("dismissing removes it like any other card", async () => {
    expect((await del("scryfallId=card-1&zone=maybeboard")).status).toBe(200);
    expect(mocks.cardDeleteMany).toHaveBeenCalledWith({ where: { deckId: "deck-1", scryfallId: "card-1", zone: "maybeboard" } });
  });
});

