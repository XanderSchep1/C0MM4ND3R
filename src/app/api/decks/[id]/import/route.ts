import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseDecklist } from "@/lib/decklist-parser";
import { resolveCardsByNames } from "@/lib/cards";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deck = await prisma.deck.findFirst({ where: { id, userId: session.user.id } });
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";
  const mode = body.mode === "replace" ? "replace" : "merge";
  if (!text.trim()) return NextResponse.json({ error: "Paste a decklist first" }, { status: 400 });

  const lines = parseDecklist(text);
  if (lines.length === 0) return NextResponse.json({ error: "Couldn't find any card lines in that text" }, { status: 400 });

  const uniqueNames = [...new Set(lines.map((l) => l.name))];
  const { resolved, unresolved } = await resolveCardsByNames(uniqueNames);

  if (mode === "replace") {
    await prisma.deckCard.deleteMany({ where: { deckId: id } });
  }

  let added = 0;
  for (const line of lines) {
    const card = resolved.get(line.name);
    if (!card) continue;
    await prisma.deckCard.upsert({
      where: { deckId_scryfallId_zone: { deckId: id, scryfallId: card.id, zone: line.zone } },
      create: { deckId: id, scryfallId: card.id, name: card.name, zone: line.zone, quantity: line.quantity },
      update: { quantity: { increment: line.quantity } },
    });
    added += line.quantity;
  }

  return NextResponse.json({ added, unresolved });
}
