import type { ScryfallCard } from "./scryfall-types";
import { cardManaCost } from "./card-helpers";

export const BASIC_LAND_BY_COLOR: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

export function countColorSymbols(cards: ScryfallCard[]): Record<string, number> {
  const counts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const card of cards) {
    const symbols = cardManaCost(card).match(/\{[^}]+\}/g) ?? [];
    for (const symbol of symbols) {
      for (const color of Object.keys(counts)) {
        if (symbol.includes(color)) counts[color]++;
      }
    }
  }
  return counts;
}

// Splits `count` basic lands across the commander's color identity,
// weighted by how often each color's mana symbols appear in the deck so
// far (largest-remainder rounding so the total always matches exactly).
// Falls back to an even split if there's no colored spell to read a ratio
// from yet, and to Wastes for a colorless identity.
export function computeBasicLandSplit(cards: ScryfallCard[], colorIdentity: string[], count: number): Record<string, number> {
  if (count <= 0) return {};
  if (colorIdentity.length === 0) return { Wastes: count };

  const symbolCounts = countColorSymbols(cards);
  const relevant = colorIdentity.filter((c) => BASIC_LAND_BY_COLOR[c]);
  const totalSymbols = relevant.reduce((sum, c) => sum + symbolCounts[c], 0);

  const weights = totalSymbols > 0 ? relevant.map((c) => symbolCounts[c] / totalSymbols) : relevant.map(() => 1 / relevant.length);

  const raw = weights.map((w) => w * count);
  const floors = raw.map(Math.floor);
  let remainder = count - floors.reduce((a, b) => a + b, 0);
  const byFractionDesc = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of byFractionDesc) {
    if (remainder <= 0) break;
    floors[i]++;
    remainder--;
  }

  const result: Record<string, number> = {};
  relevant.forEach((c, i) => {
    if (floors[i] > 0) result[BASIC_LAND_BY_COLOR[c]] = floors[i];
  });
  return result;
}
