import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { getCardsByIds, searchAndCacheCards } from "@/lib/cards";
import { colorIdentityUnion } from "@/lib/card-helpers";
import { searchScope } from "@/lib/search-scope";
import { slimCard } from "@/lib/slim-card";
import type { ScryfallCard } from "@/lib/scryfall-types";

// An answer is good for a day (Scryfall's data barely moves), so the browser may keep it: asking the same
// thing again costs nothing. `private` keeps it out of shared caches, which must never answer for a signed-in route.
const KEEP_FOR_A_DAY = { "Cache-Control": "private, max-age=86400" };
const DONT_KEEP = { "Cache-Control": "no-store" };

// The commander cards of a deck you own or were invited to (none if there's no such deck or no commander yet).
async function commandersOf(deckId: string, userId: string): Promise<ScryfallCard[]> {
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, OR: [{ userId }, { collaborators: { some: { userId } } }] },
    include: { cards: { where: { zone: "commander" } } },
  });
  if (!deck || deck.cards.length === 0) return [];
  return [...(await getCardsByIds(deck.cards.map((c) => c.scryfallId))).values()];
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const mode = url.searchParams.get("mode") ?? "any";
  const deckId = url.searchParams.get("deckId");
  const page = Number(url.searchParams.get("page") ?? "1") || 1;

  // Counting the request and reading the deck don't depend on each other, so they happen together.
  const deckSearch = mode === "card" && !!deckId && !!q;
  const [limited, commanders] = await Promise.all([
    limitRequest(userId, "search", { cards: [], hasMore: false }),
    deckSearch ? commandersOf(deckId, userId) : Promise.resolve([]),
  ]);
  if (limited) return limited;
  if (!q) return NextResponse.json({ cards: [], hasMore: false });

  const clauses = [q, "f:commander"];
  if (mode === "commander") {
    clauses.push("(is:commander or t:background)");
  } else if (deckSearch && commanders.length > 0) {
    const identity = colorIdentityUnion(commanders);
    clauses.push(`id<=${identity.length ? identity.join("") : "c"}`);
  }

  // A deck's answer depends on its commander's colours. The browser says which colours it thinks the deck
  // has; the answer may only be kept if the server sees the same, so a card search made a moment after
  // changing commander (before the change has been saved) is never remembered under the wrong colours.
  const serverScope = deckSearch ? searchScope(commanders) : "";
  const keep = (url.searchParams.get("scope") ?? "") === serverScope;

  try {
    const result = await searchAndCacheCards(clauses.join(" "), { order: "edhrec", unique: "cards", page });
    return NextResponse.json(
      { cards: result.cards.map(slimCard), hasMore: result.hasMore, totalCards: result.totalCards },
      { headers: keep ? KEEP_FOR_A_DAY : DONT_KEEP }
    );
  } catch {
    return NextResponse.json({ cards: [], hasMore: false, totalCards: 0 }, { headers: DONT_KEEP });
  }
}
