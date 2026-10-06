import type { ScryfallCard } from "./scryfall-types";
import { cardOracleText } from "./card-helpers";
import { THEMES } from "./deck-analysis";

// EDHREC's actual "Salt Score" comes from crowd-sourced voting and isn't
// exposed by any public API (Scryfall doesn't carry it, and EDHREC has no
// documented API — scraping it would be against the "no scraping" approach
// this app otherwise follows). This is a transparent, from-scratch heuristic
// over oracle text and Scryfall's own `game_changer` flag instead — labeled
// as an estimate everywhere it's shown, not presented as EDHREC's number.
export interface AnnoyanceTraitDef {
  key: string;
  label: string;
  weight: number;
  test: (card: ScryfallCard) => boolean;
}

export const ANNOYANCE_TRAITS: AnnoyanceTraitDef[] = [
  { key: "game_changer", label: "Commander Game Changer", weight: 2, test: (c) => Boolean(c.game_changer) },
  {
    key: "mld",
    label: "Mass land destruction",
    weight: 3,
    test: (c) => /destroy all lands|each player sacrifices [^.]*lands?/i.test(cardOracleText(c)),
  },
  {
    key: "stax",
    label: "Stax / resource denial",
    weight: 2,
    test: (c) => /players can(?:'t|not)|opponents can(?:'t|not)|doesn't untap during/i.test(cardOracleText(c)),
  },
  { key: "extra_turns", label: "Extra turns", weight: 2, test: (c) => /extra turn/i.test(cardOracleText(c)) },
  {
    key: "hard_counter",
    label: "Hard counterspell",
    weight: 1,
    test: (c) => /counter target spell(?! unless)/i.test(cardOracleText(c)),
  },
  { key: "tutor", label: "Tutor", weight: 1, test: (c) => THEMES.find((t) => t.key === "tutors")!.test(c) },
];

export interface FlaggedCard {
  card: ScryfallCard;
  quantity: number;
  traits: { key: string; label: string }[];
  score: number;
  // Which existing THEMES bucket (ramp/removal/draw/...) this card also
  // belongs to, if any — used to source "does almost the same thing"
  // alternatives from the same pool the suggestions engine already draws
  // from. Null means we don't have a clean functional bucket to swap from.
  replaceThemeKey: string | null;
}

export interface AnnoyanceReport {
  meter: "Low" | "Medium" | "High";
  totalScore: number;
  flagged: FlaggedCard[];
}

function findReplacementTheme(card: ScryfallCard): string | null {
  const match = THEMES.find((theme) => theme.test(card));
  return match?.key ?? null;
}

export function analyzeAnnoyance(cards: { card: ScryfallCard; quantity: number }[]): AnnoyanceReport {
  const flagged: FlaggedCard[] = [];

  for (const { card, quantity } of cards) {
    const traits = ANNOYANCE_TRAITS.filter((t) => t.test(card));
    if (traits.length === 0) continue;
    flagged.push({
      card,
      quantity,
      traits: traits.map((t) => ({ key: t.key, label: t.label })),
      score: traits.reduce((sum, t) => sum + t.weight, 0),
      replaceThemeKey: findReplacementTheme(card),
    });
  }

  flagged.sort((a, b) => b.score - a.score);
  const totalScore = flagged.reduce((sum, f) => sum + f.score * f.quantity, 0);
  const meter: AnnoyanceReport["meter"] = totalScore >= 14 ? "High" : totalScore >= 6 ? "Medium" : "Low";

  return { meter, totalScore, flagged };
}
