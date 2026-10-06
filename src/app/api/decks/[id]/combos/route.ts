import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { colorIdentityUnion, isBasicLand } from "@/lib/card-helpers";
import { findCombosForCardNames, findComboOpportunities } from "@/lib/combos";
import { resolveCardsByNames } from "@/lib/cards";

const MAX_RESULTS_PER_GROUP = 10;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const resolved = await resolveDeck(deck);
  if (resolved.commanders.length === 0) {
    return NextResponse.json({ error: "Pick a commander before searching for combos" }, { status: 400 });
  }

  const owned = [...resolved.commanders, ...resolved.mainboard];
  const colorIdentity = colorIdentityUnion(resolved.commanders.map((c) => c.card));
  const searchNames = owned.filter((e) => !isBasicLand(e.card)).map((e) => e.card.name);

  let variants;
  try {
    variants = await findCombosForCardNames(searchNames, colorIdentity);
  } catch {
    return NextResponse.json({ error: "Combo lookup failed (Commander Spellbook may be unavailable)" }, { status: 502 });
  }

  const ownedOracleIds = new Set(owned.map((e) => e.card.oracle_id).filter((x): x is string => Boolean(x)));
  const { complete, near } = findComboOpportunities(variants, ownedOracleIds);

  const topComplete = complete.slice(0, MAX_RESULTS_PER_GROUP);
  const topNear = near.slice(0, MAX_RESULTS_PER_GROUP);

  // Resolve missing pieces to real Scryfall ids so the client can add them
  // directly, rather than just naming them.
  const missingNames = [...new Set(topNear.flatMap((n) => n.missing.map((m) => m.name)))];
  const { resolved: resolvedMissing } = await resolveCardsByNames(missingNames);

  const near_ = topNear.map((n) => ({
    ...n,
    missing: n.missing.map((m) => ({ ...m, scryfallId: resolvedMissing.get(m.name)?.id ?? null })),
  }));

  return NextResponse.json({ complete: topComplete, near: near_ });
}
