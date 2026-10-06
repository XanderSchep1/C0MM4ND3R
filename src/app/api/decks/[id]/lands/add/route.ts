import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { getCardsByIds } from "@/lib/cards";
import { colorIdentityUnion, isBasicLand } from "@/lib/card-helpers";
import { basicToRemove, computeLandBalance, isLand, isRemovableBasic } from "@/lib/land-balance";

// Adds one land to the mainboard and, when that would push the deck past 99
// cards or its land target, swaps out the basic whose color the deck has the
// most spare sources of — so accepting a land keeps the deck in balance.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const scryfallId = typeof body.scryfallId === "string" ? body.scryfallId : "";
  if (!scryfallId) return NextResponse.json({ error: "scryfallId is required" }, { status: 400 });

  const resolved = await resolveDeck(deck);
  if (resolved.commanders.length === 0) return NextResponse.json({ error: "Pick a commander first" }, { status: 400 });

  const card = (await getCardsByIds([scryfallId])).get(scryfallId);
  if (!card) return NextResponse.json({ error: "Unknown Scryfall card id" }, { status: 400 });
  if (!isLand(card) || isBasicLand(card)) return NextResponse.json({ error: `${card.name} isn't a special land` }, { status: 400 });

  const colorIdentity = colorIdentityUnion(resolved.commanders.map((c) => c.card));
  if (!card.color_identity.every((c) => colorIdentity.includes(c))) {
    return NextResponse.json({ error: `${card.name} doesn't fit your commander's color identity` }, { status: 400 });
  }
  if (resolved.mainboard.some((e) => e.card.name === card.name)) {
    return NextResponse.json({ error: `${card.name} is already in your deck` }, { status: 409 });
  }

  const before = computeLandBalance(resolved.commanders, resolved.mainboard, colorIdentity);
  const mainboardCount = resolved.mainboard.reduce((sum, e) => sum + e.quantity, 0);
  const needsRoom = mainboardCount >= 99 || before.landCount >= before.landTarget;

  let removedName: string | null = null;
  if (needsRoom) {
    const basic = basicToRemove(resolved.mainboard.filter((e) => isRemovableBasic(e.card)), before);
    if (basic) {
      removedName = basic.card.name;
      const key = { deckId_scryfallId_zone: { deckId: id, scryfallId: basic.card.id, zone: "mainboard" } };
      if (basic.quantity <= 1) await prisma.deckCard.delete({ where: key });
      else await prisma.deckCard.update({ where: key, data: { quantity: basic.quantity - 1 } });
    }
  }

  await prisma.deckCard.upsert({
    where: { deckId_scryfallId_zone: { deckId: id, scryfallId, zone: "mainboard" } },
    create: { deckId: id, scryfallId, name: card.name, zone: "mainboard", quantity: 1 },
    update: { quantity: { increment: 1 } },
  });

  const updated = await resolveDeck((await getOwnedDeck(id, session.user.id))!);
  return NextResponse.json({
    added: card.name,
    removed: removedName,
    warning: needsRoom && !removedName ? "No basic land was available to swap out, so the deck may now be over 100 cards." : null,
    balance: computeLandBalance(updated.commanders, updated.mainboard, colorIdentity),
  });
}
