import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  deckFindFirst: vi.fn(),
  cardFindUnique: vi.fn(),
  cardUpdate: vi.fn(),
  cardUpsert: vi.fn(),
  cardDelete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/cards", () => ({ getCardsByIds: async () => new Map() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findFirst: mocks.deckFindFirst },
    deckCard: { findUnique: mocks.cardFindUnique, update: mocks.cardUpdate, upsert: mocks.cardUpsert, delete: mocks.cardDelete, count: async () => 0 },
    $transaction: mocks.transaction,
    $queryRaw: async () => [{ count: 1, windowStart: new Date() }],
    rateLimit: { deleteMany: async () => ({ count: 0 }) },
  },
}));

import { PATCH } from "./route";

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
    expect(mocks.deckFindFirst.mock.calls[0][0].where).toMatchObject({ id: "deck-1", userId: "user-1" });
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
});
