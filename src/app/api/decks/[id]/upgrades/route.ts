import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { colorIdentityUnion } from "@/lib/card-helpers";
import { getRecentSets } from "@/lib/sets";
import { findUpgrades } from "@/lib/set-upgrades";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "upgrades");
  if (limited) return limited;

  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const seen = new Set(deck.upgradesSeenSets);
  const sets = (await getRecentSets()).map((s) => ({ ...s, seen: seen.has(s.code) }));
  return NextResponse.json({ sets });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "upgrades");
  if (limited) return limited;

  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const resolved = await resolveDeck(deck);
  if (resolved.commanders.length === 0) {
    return NextResponse.json({ error: "Pick a commander before checking for upgrades" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const requested: unknown = body?.sets;
  if (!Array.isArray(requested) || requested.length === 0) {
    return NextResponse.json({ error: "Select at least one set" }, { status: 400 });
  }

  // Only accept codes from the known recent-sets list — they get interpolated
  // into a Scryfall query, so arbitrary client input must never reach it.
  const recent = await getRecentSets();
  const setCodes = recent.map((s) => s.code).filter((code) => requested.includes(code));
  if (setCodes.length === 0) return NextResponse.json({ error: "Unknown set selection" }, { status: 400 });

  const colorIdentity = colorIdentityUnion(resolved.commanders.map((c) => c.card));
  const suggestions = await findUpgrades({
    commanders: resolved.commanders,
    mainboard: resolved.mainboard,
    maybeboard: resolved.maybeboard,
    colorIdentity,
    setCodes,
  });

  await prisma.deck.update({
    where: { id: deck.id },
    data: { upgradesSeenSets: Array.from(new Set([...deck.upgradesSeenSets, ...setCodes])) },
  });

  return NextResponse.json({ suggestions, sets: recent.filter((s) => setCodes.includes(s.code)) });
}
