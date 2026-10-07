import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/api-guard";
import { MAX_DECK_NAME, MAX_DECKS_PER_USER } from "@/lib/limits";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decks = await prisma.deck.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { cards: true } } },
  });

  return NextResponse.json({ decks });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await limitRequest(session.user.id, "createDeck");
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_DECK_NAME) : "";
  if (!name) return NextResponse.json({ error: "Deck name is required" }, { status: 400 });

  if ((await prisma.deck.count({ where: { userId: session.user.id } })) >= MAX_DECKS_PER_USER) {
    return NextResponse.json({ error: `You've reached the limit of ${MAX_DECKS_PER_USER} decks. Delete one to make room.` }, { status: 400 });
  }

  const deck = await prisma.deck.create({
    data: { userId: session.user.id, name, format: "commander" },
  });

  return NextResponse.json({ deck }, { status: 201 });
}
