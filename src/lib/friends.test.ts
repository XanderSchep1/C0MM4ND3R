import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  friendshipFindUnique: vi.fn(),
  friendshipFindMany: vi.fn(),
  friendshipUpsert: vi.fn(),
  friendshipDeleteMany: vi.fn(),
  collaboratorDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    user: { findUnique: db.userFindUnique, update: db.userUpdate },
    friendship: { findUnique: db.friendshipFindUnique, findMany: db.friendshipFindMany, upsert: db.friendshipUpsert, deleteMany: db.friendshipDeleteMany },
    deckCollaborator: { deleteMany: db.collaboratorDeleteMany },
    $transaction: db.transaction,
  },
}));

import { acceptInvite, areFriends, getFriendCode, isFriendCode, listFriends, lookupInvite, makeFriendCode, orderPair, regenerateFriendCode, removeFriend } from "./friends";

const GOOD_CODE = "ABCDEFGHJKMNPQRSTUVW"; // 20 characters from the alphabet

describe("friend codes", () => {
  it("are 20 characters without look-alikes, and don't repeat", () => {
    const codes = new Set(Array.from({ length: 300 }, makeFriendCode));
    expect(codes.size).toBe(300);
    for (const code of codes) {
      expect(code).toHaveLength(20);
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]+$/);
    }
  });

  it("are only accepted in exactly that shape", () => {
    expect(isFriendCode(GOOD_CODE)).toBe(true);
    for (const bad of ["", "short", GOOD_CODE + "A", "ABCDEFGHJKMNPQRSTUV0", "abcdefghjkmnpqrstuvw", null, undefined, 5, `${GOOD_CODE.slice(0, 19)}!`]) {
      expect(isFriendCode(bad), String(bad)).toBe(false);
    }
  });
});

describe("orderPair", () => {
  it("stores a pair the same way round whichever person is first", () => {
    expect(orderPair("b", "a")).toEqual(["a", "b"]);
    expect(orderPair("a", "b")).toEqual(["a", "b"]);
  });
});

describe("friends", () => {
  beforeEach(() => Object.values(db).forEach((m) => m.mockReset()));

  it("reuses a person's friend code and makes one the first time", async () => {
    db.userFindUnique.mockResolvedValueOnce({ friendCode: GOOD_CODE });
    expect(await getFriendCode("u1")).toBe(GOOD_CODE);
    expect(db.userUpdate).not.toHaveBeenCalled();

    db.userFindUnique.mockResolvedValueOnce({ friendCode: null });
    const made = await getFriendCode("u1");
    expect(isFriendCode(made)).toBe(true);
    expect(db.userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { friendCode: made } });
  });

  it("a new code replaces the old one, which cancels the old link", async () => {
    const next = await regenerateFriendCode("u1");
    expect(isFriendCode(next)).toBe(true);
    expect(db.userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { friendCode: next } });
  });

  it("lists the other person of each pair, by display name", async () => {
    db.friendshipFindMany.mockResolvedValue([
      { userAId: "u1", userBId: "u2", userA: { id: "u1", name: "Me", email: "me@x.test" }, userB: { id: "u2", name: "  Alice ", email: "alice@x.test" } },
      { userAId: "u0", userBId: "u1", userA: { id: "u0", name: null, email: "bob@x.test" }, userB: { id: "u1", name: "Me", email: "me@x.test" } },
    ]);
    expect(await listFriends("u1")).toEqual([
      { id: "u2", name: "Alice" },
      { id: "u0", name: "bob" },
    ]);
  });

  it("a person is never their own friend", async () => {
    expect(await areFriends("u1", "u1")).toBe(false);
    expect(db.friendshipFindUnique).not.toHaveBeenCalled();
  });
});

describe("accepting an invite link", () => {
  beforeEach(() => Object.values(db).forEach((m) => m.mockReset()));
  const owner = { id: "u9", name: "Dana", email: "dana@x.test" };

  it("rejects a malformed code without touching the database", async () => {
    expect(await acceptInvite("u1", "nope")).toEqual({ status: "invalid" });
    expect(db.userFindUnique).not.toHaveBeenCalled();
  });

  it("rejects a code nobody has (it may have been replaced)", async () => {
    db.userFindUnique.mockResolvedValue(null);
    expect(await acceptInvite("u1", GOOD_CODE)).toEqual({ status: "invalid" });
    expect(db.friendshipUpsert).not.toHaveBeenCalled();
  });

  it("won't make you your own friend", async () => {
    db.userFindUnique.mockResolvedValue({ ...owner, id: "u1" });
    expect(await acceptInvite("u1", GOOD_CODE)).toEqual({ status: "self" });
    expect(db.friendshipUpsert).not.toHaveBeenCalled();
  });

  it("says so when you're already friends", async () => {
    db.userFindUnique.mockResolvedValue(owner);
    db.friendshipFindUnique.mockResolvedValue({ id: "f1" });
    expect(await acceptInvite("u1", GOOD_CODE)).toEqual({ status: "already", friend: { id: "u9", name: "Dana" } });
    expect(db.friendshipUpsert).not.toHaveBeenCalled();
  });

  it("makes the friendship, one row for the pair with the smaller id first", async () => {
    db.userFindUnique.mockResolvedValue(owner);
    db.friendshipFindUnique.mockResolvedValue(null);
    expect(await acceptInvite("u1", GOOD_CODE)).toEqual({ status: "ok", friend: { id: "u9", name: "Dana" } });
    expect(db.friendshipUpsert).toHaveBeenCalledWith({ where: { userAId_userBId: { userAId: "u1", userBId: "u9" } }, create: { userAId: "u1", userBId: "u9" }, update: {} });
  });

  it("looking at an invite changes nothing", async () => {
    db.userFindUnique.mockResolvedValue(owner);
    db.friendshipFindUnique.mockResolvedValue(null);
    expect(await lookupInvite("u1", GOOD_CODE)).toEqual({ status: "pending", friend: { id: "u9", name: "Dana" } });
    expect(db.friendshipUpsert).not.toHaveBeenCalled();
  });
});

describe("removing a friend", () => {
  beforeEach(() => Object.values(db).forEach((m) => m.mockReset()));

  it("ends the friendship and takes each person off the other's decks, in one transaction", async () => {
    db.transaction.mockResolvedValue([]);
    await removeFriend("u9", "u1");
    expect(db.friendshipDeleteMany).toHaveBeenCalledWith({ where: { userAId: "u1", userBId: "u9" } });
    expect(db.collaboratorDeleteMany).toHaveBeenCalledWith({ where: { OR: [{ userId: "u1", deck: { userId: "u9" } }, { userId: "u9", deck: { userId: "u1" } }] } });
    expect(db.transaction).toHaveBeenCalledOnce();
  });
});
