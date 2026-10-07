import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { validateCommanderDeck } from "@/lib/commander";
import { analyzeDeck, estimatePowerLevel, THEMES, TARGET_NONLAND_COUNT } from "@/lib/deck-analysis";
import { averageCmc, projectionScale, runSimulation, type DeckProfile } from "@/lib/game-sim";
import { searchAndCacheCards } from "@/lib/cards";
import type { SuggestionGroup } from "@/lib/suggestions";

const WEAK_SPOT_THEME_KEY: Record<string, string> = {
  ramp: "ramp",
  removal: "removal",
  wipes: "board_wipes",
  draw: "draw",
  tutors: "tutors",
  counterspells: "counterspells",
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "simulate");
  if (limited) return limited;

  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const resolved = await resolveDeck(deck);
  if (resolved.commanders.length === 0) {
    return NextResponse.json({ error: "Pick a commander before running a simulation" }, { status: 400 });
  }

  const url = new URL(request.url);
  const bracket = Math.min(5, Math.max(1, Number(url.searchParams.get("bracket")) || 3));

  const validation = validateCommanderDeck(resolved.commanders, resolved.mainboard);
  const colorIdentity = validation.colorIdentity;
  const analysis = analyzeDeck(resolved.mainboard, colorIdentity);
  const powerLevel = estimatePowerLevel([...resolved.commanders, ...resolved.mainboard]);
  const theme = (key: string) => analysis.themes.find((t) => t.key === key)?.count ?? 0;

  // Project raw counts to "if you finished building at this same ratio"
  // rates, so a 30-card work-in-progress isn't just compared unfavorably
  // against a full 99-card baseline on card count alone.
  const scale = projectionScale(analysis.nonlandCount, TARGET_NONLAND_COUNT);
  const projected = (count: number) => Math.round(count * scale);

  const userProfile: DeckProfile = {
    label: deck.name,
    ramp: projected(theme("ramp")),
    removal: projected(theme("removal")),
    wipes: projected(theme("board_wipes")),
    draw: projected(theme("draw")),
    tutors: projected(theme("tutors")),
    counterspells: projected(theme("counterspells")),
    avgCmc: averageCmc(analysis.curve),
    gameChangers: powerLevel.gameChangers.count,
    landCount: analysis.landCount,
  };

  const result = runSimulation(userProfile, bracket, scale);

  const excludeNames = new Set(
    [...resolved.commanders, ...resolved.mainboard, ...resolved.maybeboard].map((e) => e.card.name.toLowerCase())
  );
  const base = `id<=${colorIdentity.length ? colorIdentity.join("") : "c"} f:commander -is:funny game:paper`;
  const suggestions = (
    await Promise.all(
      result.weakSpots.map(async (spot): Promise<SuggestionGroup | null> => {
        const themeDef = THEMES.find((t) => t.key === WEAK_SPOT_THEME_KEY[spot.key]);
        if (!themeDef) return null;
        const { cards } = await searchAndCacheCards(`${base} ${themeDef.scryfallClause}`, { order: "edhrec", unique: "cards" });
        const filtered = cards.filter((c) => !excludeNames.has(c.name.toLowerCase())).slice(0, 8);
        if (filtered.length === 0) return null;
        return {
          key: spot.key,
          label: spot.label,
          reason: `You have ${spot.userValue} — Bracket ${bracket} decks run roughly ${spot.benchmark}.`,
          cards: filtered,
        };
      })
    )
  ).filter((g): g is SuggestionGroup => g !== null);

  return NextResponse.json({ result, suggestions });
}
