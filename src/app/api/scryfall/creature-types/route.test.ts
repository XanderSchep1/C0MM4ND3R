import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getCreatureTypes: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/scryfall", () => ({ getCreatureTypes: mocks.getCreatureTypes }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: async () => [{ count: 1, windowStart: new Date() }],
    rateLimit: { deleteMany: async () => ({ count: 0 }) },
  },
}));

import { GET } from "./route";

describe("GET /api/scryfall/creature-types", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("answers nobody who is signed out, and doesn't bother Scryfall", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.getCreatureTypes).not.toHaveBeenCalled();
  });

  it("lists the types and lets the browser keep them for a day", async () => {
    mocks.getCreatureTypes.mockResolvedValue(["Elf", "Goblin"]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ types: ["Elf", "Goblin"] });
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=86400");
  });

  it("says there are none, and never lets that be kept, when Scryfall can't answer", async () => {
    mocks.getCreatureTypes.mockRejectedValue(new Error("Scryfall is down"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ types: [] });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
