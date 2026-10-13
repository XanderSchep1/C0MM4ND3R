import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { listFriends } from "@/lib/friends";

const MAX_COLLABORATORS = 25;

// Only the deck's owner may see or change who is invited.
async function ownedDeck(deckId: string, userId: string) {
  return prisma.deck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
}

// Your friends, each marked with whether they're invited to this deck.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "collaborators");
  if (limited) return limited;

  const { id } = await params;
  if (!(await ownedDeck(id, session.user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [friends, invited] = await Promise.all([listFriends(session.user.id), prisma.deckCollaborator.findMany({ where: { deckId: id }, select: { userId: true } })]);
  const invitedIds = new Set(invited.map((c) => c.userId));
  return NextResponse.json({ friends: friends.map((f) => ({ ...f, invited: invitedIds.has(f.id) })) });
}

// { userIds }: exactly who is invited from now on. Everyone listed has to be one of your friends.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "collaborators");
  if (limited) return limited;

  const { id } = await params;
  if (!(await ownedDeck(id, session.user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const raw: unknown = body?.userIds;
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string") || raw.length > MAX_COLLABORATORS) {
    return NextResponse.json({ error: `userIds must be a list of at most ${MAX_COLLABORATORS} ids` }, { status: 400 });
  }
  const wanted = [...new Set(raw as string[])];

  const friendIds = new Set((await listFriends(session.user.id)).map((f) => f.id));
  if (wanted.some((userId) => !friendIds.has(userId))) {
    return NextResponse.json({ error: "You can only invite your friends." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.deckCollaborator.deleteMany({ where: { deckId: id, userId: { notIn: wanted } } }),
    prisma.deckCollaborator.createMany({ data: wanted.map((userId) => ({ deckId: id, userId })), skipDuplicates: true }),
  ]);
  return NextResponse.json({ ok: true, invited: wanted.length });
}
