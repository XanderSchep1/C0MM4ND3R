import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { validateCommanderDeck } from "@/lib/commander";
import { analyzeDeck, calculatePriceTotal, estimatePowerLevel } from "@/lib/deck-analysis";
import { analyzeAnnoyance } from "@/lib/annoyance";
import { colorIdentityUnion } from "@/lib/card-helpers";
import { MAX_DECK_DESCRIPTION, MAX_DECK_NAME } from "@/lib/limits";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const resolved = await resolveDeck(deck);
  const validation = validateCommanderDeck(resolved.commanders, resolved.mainboard);
  const colorIdentity = colorIdentityUnion(resolved.commanders.map((c) => c.card));
  const analysis = analyzeDeck(resolved.mainboard, colorIdentity);
  const ownedCards = [...resolved.commanders, ...resolved.mainboard];
  const powerLevel = estimatePowerLevel(ownedCards);
  const priceTotal = calculatePriceTotal(ownedCards);
  const annoyance = analyzeAnnoyance(resolved.mainboard);

  return NextResponse.json({ deck: resolved, validation, analysis, powerLevel, priceTotal, annoyance });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deck = await prisma.deck.findFirst({ where: { id, userId: session.user.id } });
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: { name?: string; description?: string | null; public?: boolean } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, MAX_DECK_NAME);
  if (typeof body.description === "string") data.description = body.description.slice(0, MAX_DECK_DESCRIPTION);
  else if (body.description === null) data.description = null;
  if (typeof body.public === "boolean") data.public = body.public;

  const updated = await prisma.deck.update({ where: { id }, data });
  return NextResponse.json({ deck: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deck = await prisma.deck.findFirst({ where: { id, userId: session.user.id } });
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.deck.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
