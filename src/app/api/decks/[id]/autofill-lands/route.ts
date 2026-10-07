import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { colorIdentityUnion } from "@/lib/card-helpers";
import { computeBasicLandSplit } from "@/lib/land-fill";
import { resolveCardByName } from "@/lib/cards";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "lands");
  if (limited) return limited;

  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const resolved = await resolveDeck(deck);
  if (resolved.commanders.length === 0) {
    return NextResponse.json({ error: "Pick a commander before auto-filling lands" }, { status: 400 });
  }

  const currentTotal =
    resolved.commanders.reduce((sum, e) => sum + e.quantity, 0) + resolved.mainboard.reduce((sum, e) => sum + e.quantity, 0);
  const fillCount = 100 - currentTotal;
  if (fillCount <= 0) {
    return NextResponse.json({ added: 0, breakdown: {}, message: "Deck is already at (or over) 100 cards." });
  }

  const colorIdentity = colorIdentityUnion(resolved.commanders.map((c) => c.card));
  const split = computeBasicLandSplit(
    resolved.mainboard.map((e) => e.card),
    colorIdentity,
    fillCount
  );

  let added = 0;
  for (const [name, quantity] of Object.entries(split)) {
    const card = await resolveCardByName(name);
    if (!card) continue;
    await prisma.deckCard.upsert({
      where: { deckId_scryfallId_zone: { deckId: id, scryfallId: card.id, zone: "mainboard" } },
      create: { deckId: id, scryfallId: card.id, name: card.name, zone: "mainboard", quantity },
      update: { quantity: { increment: quantity } },
    });
    added += quantity;
  }

  return NextResponse.json({ added, breakdown: split });
}
