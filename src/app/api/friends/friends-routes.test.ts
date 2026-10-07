import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  acceptInvite: vi.fn(),
  getFriendCode: vi.fn(),
  listFriends: vi.fn(),
  regenerateFriendCode: vi.fn(),
  removeFriend: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/friends", () => mocks);
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: async () => [{ count: 1, windowStart: new Date() }], rateLimit: { deleteMany: async () => ({ count: 0 }) } },
}));

import { DELETE } from "./[userId]/route";
import { POST as join } from "./join/route";
import { GET, POST } from "./route";

const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("friends routes", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "me" } });
  });

  it("GET gives your friends and your friend code", async () => {
    mocks.listFriends.mockResolvedValue([{ id: "f1", name: "Alice" }]);
    mocks.getFriendCode.mockResolvedValue("CODE");
    expect(await (await GET()).json()).toEqual({ friends: [{ id: "f1", name: "Alice" }], friendCode: "CODE" });
    expect(mocks.listFriends).toHaveBeenCalledWith("me");
  });

  it("POST new-code replaces your link; anything else is refused", async () => {
    mocks.regenerateFriendCode.mockResolvedValue("NEWCODE");
    expect(await (await POST(new Request("http://x/api/friends", json({ action: "new-code" })))).json()).toEqual({ friendCode: "NEWCODE" });
    expect((await POST(new Request("http://x/api/friends", json({ action: "delete-everything" })))).status).toBe(400);
    expect(mocks.regenerateFriendCode).toHaveBeenCalledTimes(1);
  });

  it("DELETE unfriends someone, but not yourself", async () => {
    expect((await DELETE(new Request("http://x"), { params: Promise.resolve({ userId: "f1" }) })).status).toBe(200);
    expect(mocks.removeFriend).toHaveBeenCalledWith("me", "f1");
    expect((await DELETE(new Request("http://x"), { params: Promise.resolve({ userId: "me" }) })).status).toBe(404);
    expect(mocks.removeFriend).toHaveBeenCalledTimes(1);
  });

  describe("joining with a friend link", () => {
    const friend = { id: "f1", name: "Alice" };
    const attempt = async (code: unknown) => join(new Request("http://x/api/friends/join", json({ code })));

    it("makes you friends", async () => {
      mocks.acceptInvite.mockResolvedValue({ status: "ok", friend });
      const res = await attempt("abcd");
      expect(res.status).toBe(201);
      expect((await res.json()).friend).toEqual(friend);
      expect(mocks.acceptInvite).toHaveBeenCalledWith("me", "ABCD"); // codes are matched upper-case
    });

    it("says so if you already are", async () => {
      mocks.acceptInvite.mockResolvedValue({ status: "already", friend });
      const res = await attempt("CODE");
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("already");
    });

    it("refuses an unknown code and your own code", async () => {
      mocks.acceptInvite.mockResolvedValue({ status: "invalid" });
      expect((await attempt("NOPE")).status).toBe(404);
      mocks.acceptInvite.mockResolvedValue({ status: "self" });
      expect((await attempt("MINE")).status).toBe(400);
    });

    it("tolerates a missing or non-text code", async () => {
      mocks.acceptInvite.mockResolvedValue({ status: "invalid" });
      expect((await attempt(undefined)).status).toBe(404);
      expect((await attempt(12345)).status).toBe(404);
      expect(mocks.acceptInvite).toHaveBeenCalledWith("me", "");
    });
  });

  it("everything refuses anonymous callers", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(new Request("http://x", json({ action: "new-code" })))).status).toBe(401);
    expect((await join(new Request("http://x", json({ code: "A" })))).status).toBe(401);
    expect((await DELETE(new Request("http://x"), { params: Promise.resolve({ userId: "f1" }) })).status).toBe(401);
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
    expect(mocks.removeFriend).not.toHaveBeenCalled();
  });
});
