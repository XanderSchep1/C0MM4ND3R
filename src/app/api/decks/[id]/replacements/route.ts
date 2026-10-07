import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { colorIdentityUnion } from "@/lib/card-helpers";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { findReplacements } from "@/lib/replacements";

// POST, not GET: it does real work (a handful of Scryfall searches), so it only ever runs when
// the person clicks "Find replacements" — never as a side effect of opening a page or a tab.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "replacements");
  if (limited) return limited;

  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const resolved = await resolveDeck(deck);
  if (resolved.commanders.length === 0) {
    return NextResponse.json({ error: "Pick a commander before looking for replacements" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const mode = body?.mode;
  if (mode !== "cheaper" && mode !== "pricier") {
    return NextResponse.json({ error: 'mode must be "cheaper" or "pricier"' }, { status: 400 });
  }

  const result = await findReplacements({
    commanders: resolved.commanders,
    mainboard: resolved.mainboard,
    maybeboard: resolved.maybeboard,
    colorIdentity: colorIdentityUnion(resolved.commanders.map((c) => c.card)),
    mode,
  });
  return NextResponse.json(result);
}
