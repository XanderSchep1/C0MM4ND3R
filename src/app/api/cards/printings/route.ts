import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { searchAndCacheCards } from "@/lib/cards";
import { isOracleId, printingsQuery } from "@/lib/printings";

// Every paper printing of one card, newest first, for the "Choose art" picker.
//   ?oracleId=<uuid>   which card
//   &unique=art|prints art = one per distinct illustration (default), prints = every printing
//   &page=<n>          Scryfall pages hold up to 175 (a basic land has hundreds of arts)
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "printings", { cards: [], hasMore: false });
  if (limited) return limited;

  const url = new URL(request.url);
  const oracleId = url.searchParams.get("oracleId");
  if (!isOracleId(oracleId)) return NextResponse.json({ error: "oracleId must be a card's oracle id" }, { status: 400 });
  const unique = url.searchParams.get("unique") === "prints" ? "prints" : "art";
  const page = Math.min(20, Math.max(1, Number(url.searchParams.get("page")) || 1));

  try {
    const { cards, hasMore, totalCards } = await searchAndCacheCards(printingsQuery(oracleId), { order: "released", dir: "desc", unique, page });
    return NextResponse.json({ cards, hasMore, totalCards: totalCards ?? cards.length });
  } catch {
    return NextResponse.json({ error: "Couldn't load that card's printings. Try again." }, { status: 502 });
  }
}
