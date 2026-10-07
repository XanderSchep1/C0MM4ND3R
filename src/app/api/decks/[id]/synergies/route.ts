import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { getDeckAccessWithCards } from "@/lib/deck-access";
import { resolveDeck } from "@/lib/deck-data";
import { colorIdentityUnion } from "@/lib/card-helpers";
import { detectSynergySignals, suggestSynergies } from "@/lib/synergy";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "synergies");
  if (limited) return limited;

  const { id } = await params;
  // The owner and friends invited to the deck may both look at this: it only reads the deck.
  const access = await getDeckAccessWithCards(id, session.user.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const deck = access.deck;

  const resolved = await resolveDeck(deck);
  if (resolved.commanders.length === 0) {
    return NextResponse.json({ error: "Pick a commander before finding synergies" }, { status: 400 });
  }

  const colorIdentity = colorIdentityUnion(resolved.commanders.map((c) => c.card));
  const signals = detectSynergySignals(resolved.commanders, resolved.mainboard);
  const excludeNames = new Set([...resolved.commanders, ...resolved.mainboard, ...resolved.maybeboard].map((e) => e.card.name));

  if (signals.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  const groups = await suggestSynergies(signals, colorIdentity, excludeNames);
  return NextResponse.json({ groups });
}
