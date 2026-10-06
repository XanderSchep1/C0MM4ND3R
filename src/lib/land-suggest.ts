import type { ScryfallCard } from "./scryfall-types";
import { isBasicLand } from "./card-helpers";
import { resolveCardByName, searchAndCacheCards } from "./cards";
import { isLand, landColors, scoreLand, entersTapped, type LandBalance } from "./land-balance";

interface Entry {
  card: ScryfallCard;
  quantity: number;
}

export interface LandCategory {
  key: string;
  label: string;
  description: string;
  // Each clause is searched separately and contributes its own best picks, so
  // one popular family (any-color lands) can't crowd out the others (duals).
  clauses: string[];
}

export const LAND_CATEGORIES: LandCategory[] = [
  {
    key: "fixing",
    label: "Dual & fixing lands",
    description: "Shock, check, fast, slow, surveil, battle and pathway duals, pain and filter lands, plus any-color lands like Command Tower.",
    clauses: [
      '(is:dual or is:shockland or is:checkland or is:fastland or is:slowland or is:surveilland or is:bikeland or is:battleland or is:pathway or is:horizonland)',
      '(is:painland or is:filterland or is:bounceland)',
      '(o:"of any color" -o:"spend this mana only")',
    ],
  },
  { key: "fetch", label: "Fetch lands", description: "Flooded Strand, Misty Rainforest and friends — they fetch the types you need.", clauses: ["is:fetchland"] },
  { key: "tri", label: "Tri-color lands", description: "Triomes and other three-color lands.", clauses: ["is:triland"] },
  { key: "utility", label: "Utility lands", description: "Creature lands, Reliquary Tower, Rogue's Passage and other lands with a job beyond mana.", clauses: ["(otag:utility-land or otag:creature-land)"] },
];

const DEFAULT_CATEGORIES = ["fixing"];
const PER_CLAUSE = 3;
const MAX_FROM_CATEGORIES = 12;

export interface LandSuggestion {
  card: ScryfallCard;
  category: string;
  requested: boolean;
  tapped: boolean;
  colors: string[];
  reason: string;
}

const COLOR_NAME: Record<string, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green" };

function reasonFor(card: ScryfallCard, balance: LandBalance): string {
  const deckColors = balance.colors.map((c) => c.color);
  const { colors: produced } = landColors(card, deckColors);
  const short = balance.colors.filter((c) => produced.includes(c.color) && c.deficit >= 1);

  if (short.length > 0) {
    const parts = short.map((c) => `${COLOR_NAME[c.color]} (${Math.round(c.sources)} of ~${c.target} sources)`);
    return `Helps ${parts.join(" and ")}, where your deck is short on mana sources.`;
  }
  if (produced.length === 0) return "A utility land — it does a job beyond making colored mana.";
  return "Your colors are already well covered — this is a popular upgrade over a basic.";
}

export async function suggestLands(opts: {
  commanders: Entry[];
  mainboard: Entry[];
  maybeboard: Entry[];
  colorIdentity: string[];
  balance: LandBalance;
  categories: string[];
  names: string[];
}): Promise<{ suggestions: LandSuggestion[]; notes: string[] }> {
  const { commanders, mainboard, maybeboard, colorIdentity, balance, names } = opts;
  const notes: string[] = [];
  const owned = new Set([...commanders, ...mainboard, ...maybeboard].map((e) => e.card.name.toLowerCase()));
  const identity = new Set(colorIdentity);
  const deckColors = balance.colors.map((c) => c.color);
  const fitsIdentity = (c: ScryfallCard) => c.color_identity.every((x) => identity.has(x));

  const chosen = LAND_CATEGORIES.filter((c) => opts.categories.includes(c.key));
  const categories = chosen.length > 0 ? chosen : LAND_CATEGORIES.filter((c) => DEFAULT_CATEGORIES.includes(c.key));

  const taken = new Set<string>();
  const suggestions: LandSuggestion[] = [];

  // Lands the user asked for by name come first.
  for (const name of names) {
    const card = await resolveCardByName(name);
    if (!card) {
      notes.push(`Couldn't find a card called "${name}".`);
    } else if (!isLand(card) || isBasicLand(card)) {
      notes.push(`${card.name} isn't a special land, so I skipped it.`);
    } else if (card.legalities?.commander !== "legal") {
      notes.push(`${card.name} isn't legal in Commander.`);
    } else if (!fitsIdentity(card)) {
      notes.push(`${card.name} doesn't fit your commander's color identity.`);
    } else if (owned.has(card.name.toLowerCase())) {
      notes.push(`${card.name} is already in your deck.`);
    } else if (!taken.has(card.name)) {
      taken.add(card.name);
      suggestions.push({ card, category: "Your pick", requested: true, tapped: entersTapped(card), colors: landColors(card, deckColors).colors, reason: reasonFor(card, balance) });
    }
  }

  const base = `t:land -is:basic f:commander id<=${colorIdentity.length ? colorIdentity.join("") : "c"} -is:funny game:paper`;
  const perClause = await Promise.all(
    categories.flatMap((category) =>
      category.clauses.map(async (clause) => {
        const { cards } = await searchAndCacheCards(`${base} ${clause}`, { order: "edhrec", unique: "cards" });
        return cards
          .filter((c) => isLand(c) && fitsIdentity(c) && !owned.has(c.name.toLowerCase()) && !isBasicLand(c))
          // A land that makes none of the deck's colors only belongs in the utility group.
          .filter((c) => category.key === "utility" || landColors(c, deckColors).colors.length > 0)
          .map((card) => ({ card, category: category.label, score: scoreLand(card, balance) }))
          .sort((a, b) => b.score - a.score);
      })
    )
  );

  // Guarantee every searched family shows up, then fill the rest by score.
  const picked: { card: ScryfallCard; category: string; score: number }[] = [];
  for (const list of perClause) {
    let fromThisClause = 0;
    for (const item of list) {
      if (fromThisClause >= PER_CLAUSE) break;
      if (taken.has(item.card.name)) continue;
      taken.add(item.card.name);
      picked.push(item);
      fromThisClause++;
    }
  }
  const rest = perClause
    .flat()
    .filter((item) => !taken.has(item.card.name))
    .sort((a, b) => b.score - a.score);
  for (const item of rest) {
    if (picked.length >= MAX_FROM_CATEGORIES) break;
    if (!taken.has(item.card.name)) {
      taken.add(item.card.name);
      picked.push(item);
    }
  }
  picked.sort((a, b) => b.score - a.score);

  for (const item of picked) {
    suggestions.push({ card: item.card, category: item.category, requested: false, tapped: entersTapped(item.card), colors: landColors(item.card, deckColors).colors, reason: reasonFor(item.card, balance) });
  }

  return { suggestions, notes };
}
