import type { ScryfallCard } from "./scryfall-types";
import { cardOracleText, isBasicLand, primaryTypeCategory } from "./card-helpers";

export interface ThemeDef {
  key: string;
  label: string;
  // Rule-of-thumb target count for a well-rounded 99-card (non-commander) deck.
  target: number;
  // Cheap local classification against cached oracle text — used to count
  // what's already in the deck without any network calls.
  test: (card: ScryfallCard) => boolean;
  // Scryfall search clause used to source new suggestions for this theme.
  // Uses the Tagger `function:` oracle tags where Scryfall exposes a
  // reliable one (verified against the live API), otherwise a full-text
  // oracle query as a fallback.
  scryfallClause: string;
  // Only relevant when the deck's color identity includes these colors.
  requiresColors?: string[];
}

const nonLand = (card: ScryfallCard) => primaryTypeCategory(card) !== "Land";

export const THEMES: ThemeDef[] = [
  {
    key: "ramp",
    label: "Ramp",
    target: 10,
    test: (c) => nonLand(c) && /search your library for a[n]? .*land card|add (\{[cwubrg]\}|one mana|\$?\d+ mana)/i.test(cardOracleText(c)),
    scryfallClause: "function:ramp",
  },
  {
    key: "draw",
    label: "Card draw",
    target: 10,
    test: (c) => /draw (a|two|three|four|\d+) cards?/i.test(cardOracleText(c)),
    scryfallClause: "function:draw",
  },
  {
    key: "removal",
    label: "Spot removal",
    target: 10,
    test: (c) => /destroy target|exile target|-\d+\/-\d+ until end of turn to target|deals? \d+ damage to target (creature|planeswalker|any target)/i.test(cardOracleText(c)),
    scryfallClause: "function:removal",
  },
  {
    key: "board_wipes",
    label: "Board wipes",
    target: 3,
    test: (c) => /destroy all creatures|each creature gets -|all creatures get -|deals? \d+ damage to each creature/i.test(cardOracleText(c)),
    scryfallClause: "function:board-wipe",
  },
  {
    key: "tutors",
    label: "Tutors",
    target: 4,
    // Land-search ramp ("search your library for a basic land card", or
    // Farseek-style "...a Forest, Island, ... card") matches a naive "search
    // your library for ... card" pattern too, so exclude it — that's counted
    // under ramp instead.
    test: (c) =>
      /search your library for [^.]*card/i.test(cardOracleText(c)) &&
      !/search your library for [^.]*(land|forest|island|swamp|mountain|plains|wastes)/i.test(cardOracleText(c)),
    scryfallClause: "function:tutor",
  },
  {
    key: "recursion",
    label: "Recursion",
    target: 4,
    test: (c) => /return target[^.]*from (a|your) graveyard to (your hand|the battlefield)/i.test(cardOracleText(c)),
    scryfallClause: "function:recursion",
  },
  {
    key: "counterspells",
    label: "Counterspells",
    target: 3,
    test: (c) => /counter target spell/i.test(cardOracleText(c)),
    scryfallClause: "function:counterspell",
    requiresColors: ["U"],
  },
];

const TARGET_LAND_COUNT = 37;
const TARGET_NONLAND_COUNT = 63;

export interface ThemeCount {
  key: string;
  label: string;
  count: number;
  target: number;
  deficit: number;
  scryfallClause: string;
}

export interface DeckAnalysis {
  totalNonCommander: number;
  landCount: number;
  landTarget: number;
  landDeficit: number;
  nonlandCount: number;
  curve: Record<string, number>;
  themes: ThemeCount[];
}

export function analyzeDeck(cards: { card: ScryfallCard; quantity: number }[], colorIdentity: string[]): DeckAnalysis {
  let landCount = 0;
  let nonlandCount = 0;
  const curve: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6+": 0 };

  for (const { card, quantity } of cards) {
    if (primaryTypeCategory(card) === "Land") {
      landCount += quantity;
      continue;
    }
    nonlandCount += quantity;
    const bucket = card.cmc >= 6 ? "6+" : String(Math.floor(card.cmc));
    curve[bucket] = (curve[bucket] ?? 0) + quantity;
  }

  const themes: ThemeCount[] = THEMES.filter((t) => !t.requiresColors || t.requiresColors.some((c) => colorIdentity.includes(c))).map((theme) => {
    const count = cards.filter(({ card }) => !isBasicLand(card) && theme.test(card)).reduce((sum, { quantity }) => sum + quantity, 0);
    return {
      key: theme.key,
      label: theme.label,
      count,
      target: theme.target,
      deficit: Math.max(0, theme.target - count),
      scryfallClause: theme.scryfallClause,
    };
  });

  return {
    totalNonCommander: landCount + nonlandCount,
    landCount,
    landTarget: TARGET_LAND_COUNT,
    landDeficit: Math.max(0, TARGET_LAND_COUNT - landCount),
    nonlandCount,
    curve,
    themes: themes.sort((a, b) => b.deficit - a.deficit),
  };
}

export { TARGET_LAND_COUNT, TARGET_NONLAND_COUNT };

export interface GameChangerInfo {
  count: number;
  cards: { id: string; name: string }[];
}

function findGameChangers(cards: { card: ScryfallCard; quantity: number }[]): GameChangerInfo {
  const found = cards.filter(({ card }) => card.game_changer).map(({ card }) => ({ id: card.id, name: card.name }));
  return { count: found.length, cards: found };
}

export interface PowerLevelEstimate {
  bracket: string;
  label: string;
  description: string;
  gameChangers: GameChangerInfo;
}

// A rough estimate only, following WotC's public Commander Brackets
// framework (https://magic.wizards.com/en/news/announcements/introducing-commander-brackets-beta)
// by its single easiest-to-detect signal: how many cards from the official
// "Game Changers" list are in the deck. Bracket criteria also cover combo
// speed, land denial, and extra-turn chains, which aren't detectable from
// card text alone, so this under-estimates decks that are fast without
// leaning on Game Changers.
export function estimatePowerLevel(cards: { card: ScryfallCard; quantity: number }[]): PowerLevelEstimate {
  const gameChangers = findGameChangers(cards);
  const { count } = gameChangers;

  if (count === 0) {
    return {
      bracket: "1–2",
      label: "Exhibition / Core",
      description: "No Game Changers detected — reads as a casual or precon-level deck.",
      gameChangers,
    };
  }
  if (count <= 2) {
    return {
      bracket: "3",
      label: "Upgraded",
      description: `${count} Game Changer${count === 1 ? "" : "s"} — a tuned deck with some efficient staples.`,
      gameChangers,
    };
  }
  return {
    bracket: "4+",
    label: "Optimized / cEDH-leaning",
    description: `${count} Game Changers — a high-power, tournament-leaning deck.`,
    gameChangers,
  };
}

export interface PriceTotal {
  usd: number;
  pricedCount: number;
  unpricedCount: number;
}

export function calculatePriceTotal(cards: { card: ScryfallCard; quantity: number }[]): PriceTotal {
  let usd = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  for (const { card, quantity } of cards) {
    const raw = card.prices?.usd;
    const price = raw ? parseFloat(raw) : NaN;
    if (!Number.isNaN(price)) {
      usd += price * quantity;
      pricedCount += quantity;
    } else {
      unpricedCount += quantity;
    }
  }
  return { usd: Math.round(usd * 100) / 100, pricedCount, unpricedCount };
}
