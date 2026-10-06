import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { colorIdentityUnion, formatPrice, isBasicLand } from "@/lib/card-helpers";
import { findCombosForCardNames, findComboOpportunities, type ComboCardRef, type ComboVariant } from "@/lib/combos";
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

  // Combo data comes from Commander Spellbook, which has no card prices — take
  // them from the Scryfall data we already hold for the deck and missing pieces
  // (both whole names and front-face names, since DFCs are listed either way).
  const priceByName = new Map<string, string>();
  const rememberPrice = (card: { name: string; type_line: string; prices?: Record<string, string | null> }) => {
    const price = formatPrice(card);
    priceByName.set(card.name.toLowerCase(), price);
    priceByName.set(card.name.split(" // ")[0].toLowerCase(), price);
  };
  owned.forEach((e) => rememberPrice(e.card));
  resolvedMissing.forEach((card) => rememberPrice(card));
  const priced = (c: ComboCardRef): ComboCardRef => ({ ...c, price: priceByName.get(c.name.toLowerCase()) });
  const pricedVariant = (v: ComboVariant): ComboVariant => ({ ...v, cards: v.cards.map(priced) });

  const near_ = topNear.map((n) => ({
    variant: pricedVariant(n.variant),
    missing: n.missing.map((m) => ({ ...priced(m), scryfallId: resolvedMissing.get(m.name)?.id ?? null })),
  }));

  return NextResponse.json({ complete: topComplete.map(pricedVariant), near: near_ });
}
