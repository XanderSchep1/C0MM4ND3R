import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { searchAndCacheCards } from "@/lib/cards";
import { colorIdentityUnion } from "@/lib/card-helpers";
import { getCardsByIds } from "@/lib/cards";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "search", { cards: [], hasMore: false });
  if (limited) return limited;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const mode = url.searchParams.get("mode") ?? "any";
  const deckId = url.searchParams.get("deckId");
  const page = Number(url.searchParams.get("page") ?? "1") || 1;
  if (!q) return NextResponse.json({ cards: [], hasMore: false });

  const clauses = [q, "f:commander"];
  if (mode === "commander") {
    clauses.push("(is:commander or t:background)");
  } else if (mode === "card" && deckId) {
    // The colors come from the commander of a deck you own or were invited to.
    const deck = await prisma.deck.findFirst({
      where: { id: deckId, OR: [{ userId: session.user.id }, { collaborators: { some: { userId: session.user.id } } }] },
      include: { cards: { where: { zone: "commander" } } },
    });
    if (deck && deck.cards.length > 0) {
      const cardMap = await getCardsByIds(deck.cards.map((c) => c.scryfallId));
      const identity = colorIdentityUnion([...cardMap.values()]);
      clauses.push(`id<=${identity.length ? identity.join("") : "c"}`);
    }
  }

  try {
    const result = await searchAndCacheCards(clauses.join(" "), { order: "edhrec", unique: "cards", page });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ cards: [], hasMore: false, totalCards: 0 });
  }
}
