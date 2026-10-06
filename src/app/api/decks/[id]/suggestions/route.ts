import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { analyzeDeck } from "@/lib/deck-analysis";
import { colorIdentityUnion } from "@/lib/card-helpers";
import { suggestForGaps } from "@/lib/suggestions";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const resolved = await resolveDeck(deck);
  if (resolved.commanders.length === 0) {
    return NextResponse.json({ error: "Pick a commander before getting suggestions" }, { status: 400 });
  }

  const colorIdentity = colorIdentityUnion(resolved.commanders.map((c) => c.card));
  const analysis = analyzeDeck(resolved.mainboard, colorIdentity);
  const excludeNames = new Set(
    [...resolved.commanders, ...resolved.mainboard, ...resolved.maybeboard].map((e) => e.card.name)
  );

  const groups = await suggestForGaps(analysis, colorIdentity, excludeNames);

  return NextResponse.json({ groups, analysis, colorIdentity });
}
