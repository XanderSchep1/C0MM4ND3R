import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  deckCount: vi.fn(),
  deckCreate: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { count: mocks.deckCount, create: mocks.deckCreate },
    $queryRaw: async () => [{ count: 1, windowStart: new Date() }],
    rateLimit: { deleteMany: async () => ({ count: 0 }) },
  },
}));

import { POST } from "./route";

const post = async (body: unknown) =>
  (await POST(new Request("http://localhost/api/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))) as Response;

describe("POST /api/decks", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.deckCount.mockResolvedValue(0);
    mocks.deckCreate.mockImplementation(async ({ data }) => ({ id: "deck-1", ...data }));
  });

  it("opens a new deck to anyone with the link, so a pasted address shows it read-only", async () => {
    const res = await post({ name: "Atraxa" });
    expect(res.status).toBe(201);
    expect(mocks.deckCreate).toHaveBeenCalledWith({ data: { userId: "user-1", name: "Atraxa", format: "commander", public: true } });
  });

  it("still needs a name", async () => {
    const res = await post({ name: "   " });
    expect(res.status).toBe(400);
    expect(mocks.deckCreate).not.toHaveBeenCalled();
  });
});
