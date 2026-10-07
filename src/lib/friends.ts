import { randomInt } from "node:crypto";
import { prisma } from "./prisma";

// No look-alike characters (I, L, O, 0, 1): invite links get read aloud and retyped.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 20; // 31^20 ≈ 2^99: not guessable

export function makeFriendCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export const isFriendCode = (value: unknown): value is string => typeof value === "string" && value.length === CODE_LENGTH && [...value].every((c) => ALPHABET.includes(c));

// One Friendship row per pair, always smaller id first, so (a, b) and (b, a) are the same pair.
export function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export interface Friend {
  id: string;
  name: string;
}

const displayName = (user: { name: string | null; email: string | null }) => user.name?.trim() || user.email?.split("@")[0] || "Someone";

// Creates the person's friend code the first time they ask for it.
export async function getFriendCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { friendCode: true } });
  if (user?.friendCode) return user.friendCode;
  return regenerateFriendCode(userId);
}

// A new code cancels the old link.
export async function regenerateFriendCode(userId: string): Promise<string> {
  const friendCode = makeFriendCode();
  await prisma.user.update({ where: { id: userId }, data: { friendCode } });
  return friendCode;
}

export async function listFriends(userId: string): Promise<Friend[]> {
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: { userA: { select: { id: true, name: true, email: true } }, userB: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => {
    const other = row.userAId === userId ? row.userB : row.userA;
    return { id: other.id, name: displayName(other) };
  });
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const [userAId, userBId] = orderPair(a, b);
  return Boolean(await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } }, select: { id: true } }));
}

export type InviteOutcome =
  | { status: "invalid" } // no one has that code (it may have been replaced)
  | { status: "self" }
  | { status: "already"; friend: Friend }
  | { status: "ok"; friend: Friend };

// Who the code belongs to, without changing anything (so the join page can say "X invited you").
export async function lookupInvite(userId: string, code: string): Promise<InviteOutcome | { status: "pending"; friend: Friend }> {
  if (!isFriendCode(code)) return { status: "invalid" };
  const owner = await prisma.user.findUnique({ where: { friendCode: code }, select: { id: true, name: true, email: true } });
  if (!owner) return { status: "invalid" };
  if (owner.id === userId) return { status: "self" };
  const friend = { id: owner.id, name: displayName(owner) };
  return (await areFriends(userId, owner.id)) ? { status: "already", friend } : { status: "pending", friend };
}

export async function acceptInvite(userId: string, code: string): Promise<InviteOutcome> {
  const found = await lookupInvite(userId, code);
  if (found.status !== "pending") return found;
  const [userAId, userBId] = orderPair(userId, found.friend.id);
  // Two people opening each other's links at once must not create the pair twice.
  await prisma.friendship.upsert({ where: { userAId_userBId: { userAId, userBId } }, create: { userAId, userBId }, update: {} });
  return { status: "ok", friend: found.friend };
}

// Ends the friendship and takes each of them off the other's decks. Cards a friend already suggested stay
// in the owner's Maybeboard (still marked as theirs) for the owner to accept or dismiss.
export async function removeFriend(userId: string, friendId: string): Promise<void> {
  const [userAId, userBId] = orderPair(userId, friendId);
  await prisma.$transaction([
    prisma.friendship.deleteMany({ where: { userAId, userBId } }),
    prisma.deckCollaborator.deleteMany({
      where: { OR: [{ userId: friendId, deck: { userId } }, { userId, deck: { userId: friendId } }] },
    }),
  ]);
}
