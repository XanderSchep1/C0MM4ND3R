import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  deckFindFirst: vi.fn(),
  collabFindMany: vi.fn(),
  collabDeleteMany: vi.fn(),
  collabCreateMany: vi.fn(),
  transaction: vi.fn(),
  listFriends: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/friends", () => ({ listFriends: mocks.listFriends }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findFirst: mocks.deckFindFirst },
    deckCollaborator: { findMany: mocks.collabFindMany, deleteMany: mocks.collabDeleteMany, createMany: mocks.collabCreateMany },
    $transaction: mocks.transaction,
    $queryRaw: async () => [{ count: 1, windowStart: new Date() }],
    rateLimit: { deleteMany: async () => ({ count: 0 }) },
  },
}));

import { GET, PUT } from "./route";

const context = { params: Promise.resolve({ id: "deck-1" }) };
const put = async (body: unknown) =>
  (await PUT(new Request("http://localhost/api/decks/deck-1/collaborators", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), context)) as Response;
const get = async () => (await GET(new Request("http://localhost/api/decks/deck-1/collaborators"), context)) as Response;

describe("deck collaborators", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.deckFindFirst.mockResolvedValue({ id: "deck-1" });
    mocks.listFriends.mockResolvedValue([
      { id: "f1", name: "Alice" },
      { id: "f2", name: "Bob" },
    ]);
    mocks.transaction.mockResolvedValue([]);
  });

  it("only the owner can see or change who is invited (a lookup scoped to the owner)", async () => {
    mocks.deckFindFirst.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect((await put({ userIds: [] })).status).toBe(404);
    expect(mocks.deckFindFirst.mock.calls[0][0].where).toEqual({ id: "deck-1", userId: "owner-1" });
    expect(mocks.collabCreateMany).not.toHaveBeenCalled();
  });

  it("lists your friends, marking who is invited", async () => {
    mocks.collabFindMany.mockResolvedValue([{ userId: "f2" }]);
    const body = await (await get()).json();
    expect(body.friends).toEqual([
      { id: "f1", name: "Alice", invited: false },
      { id: "f2", name: "Bob", invited: true },
    ]);
  });

  it("sets exactly who is invited: removes the rest, adds the new ones", async () => {
    const res = await put({ userIds: ["f1"] });
    expect(res.status).toBe(200);
    expect(mocks.collabDeleteMany).toHaveBeenCalledWith({ where: { deckId: "deck-1", userId: { notIn: ["f1"] } } });
    expect(mocks.collabCreateMany).toHaveBeenCalledWith({ data: [{ deckId: "deck-1", userId: "f1" }], skipDuplicates: true });
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("an empty list uninvites everyone", async () => {
    expect((await put({ userIds: [] })).status).toBe(200);
    expect(mocks.collabDeleteMany).toHaveBeenCalledWith({ where: { deckId: "deck-1", userId: { notIn: [] } } });
  });

  it("refuses anyone who isn't your friend", async () => {
    const res = await put({ userIds: ["f1", "stranger"] });
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.collabCreateMany).not.toHaveBeenCalled();
  });

  it("refuses a malformed or oversized list, and ignores repeats", async () => {
    for (const body of [{}, { userIds: "f1" }, { userIds: [1] }, { userIds: Array.from({ length: 26 }, (_, i) => `u${i}`) }]) {
      expect((await put(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await put({ userIds: ["f1", "f1"] })).status).toBe(200);
    expect(mocks.collabCreateMany).toHaveBeenCalledWith({ data: [{ deckId: "deck-1", userId: "f1" }], skipDuplicates: true });
  });

  it("refuses anonymous callers", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect((await put({ userIds: [] })).status).toBe(401);
  });
});
