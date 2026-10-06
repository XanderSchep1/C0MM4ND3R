import type { ScryfallCard } from "./scryfall-types";
import { cardOracleText, creatureSubtypes, isBasicLand } from "./card-helpers";
import { searchAndCacheCards } from "./cards";

// Evergreen keywords show up on huge swaths of unrelated cards, so their
// presence doesn't signal a deck is actually built around them — only
// non-evergreen keywords (Proliferate, Convoke, Landfall, ...) are treated
// as a real synergy signal.
const EVERGREEN_KEYWORDS = new Set([
  "Flying",
  "Vigilance",
  "Trample",
  "Haste",
  "First strike",
  "Double strike",
  "Deathtouch",
  "Menace",
  "Reach",
  "Defender",
  "Hexproof",
  "Indestructible",
  "Lifelink",
  "Ward",
  "Flash",
  "Protection",
]);

interface SynergyThemeDef {
  key: string;
  label: string;
  test: (card: ScryfallCard) => boolean;
  scryfallClause: string;
}

// "X matters" archetype signals — each scryfallClause was spot-checked
// against the live Scryfall API to confirm it returns relevant results.
const SYNERGY_THEMES: SynergyThemeDef[] = [
  { key: "counters", label: "+1/+1 counters", test: (c) => /\+1\/\+1 counters?/i.test(cardOracleText(c)), scryfallClause: "function:counters-matter" },
  { key: "artifacts", label: "Artifacts", test: (c) => /\bartifacts?\b/i.test(cardOracleText(c)), scryfallClause: "o:artifact" },
  { key: "enchantments", label: "Enchantments", test: (c) => /\benchantments?\b/i.test(cardOracleText(c)), scryfallClause: "o:enchantment" },
  { key: "tokens", label: "Tokens", test: (c) => /\btokens?\b/i.test(cardOracleText(c)), scryfallClause: "o:token" },
  { key: "sacrifice", label: "Sacrifice", test: (c) => /\bsacrifice[sd]?\b/i.test(cardOracleText(c)), scryfallClause: "o:sacrifice" },
  { key: "graveyard", label: "Graveyard", test: (c) => /\bgraveyard\b/i.test(cardOracleText(c)), scryfallClause: "o:graveyard" },
  { key: "lifegain", label: "Lifegain", test: (c) => /gain[s]? \d+ life|you gain life/i.test(cardOracleText(c)), scryfallClause: "function:lifegain" },
];

export interface SynergySignal {
  key: string;
  label: string;
  kind: "tribal" | "keyword" | "theme";
  count: number;
  scryfallClause: string;
}

const COMMANDER_WEIGHT = 3;
const MIN_SIGNAL_WEIGHT = 3;
const MAX_SIGNALS = 5;

// Tallies creature types, non-evergreen keywords, and archetype themes
// across the commander (weighted heavily, since it defines the deck) and
// the rest of the deck, then ranks whichever signals clear the threshold —
// either the commander alone, or three-plus cards agreeing on a direction.
export function detectSynergySignals(
  commanders: { card: ScryfallCard; quantity: number }[],
  mainboard: { card: ScryfallCard; quantity: number }[]
): SynergySignal[] {
  const commanderIds = new Set(commanders.map((e) => e.card.id));
  const owned = [...commanders, ...mainboard];

  const tribalCounts = new Map<string, number>();
  const keywordCounts = new Map<string, number>();
  const themeCounts = new Map<string, number>();

  for (const { card, quantity } of owned) {
    if (isBasicLand(card)) continue;
    const weight = commanderIds.has(card.id) ? COMMANDER_WEIGHT : quantity;

    for (const type of creatureSubtypes(card)) {
      tribalCounts.set(type, (tribalCounts.get(type) ?? 0) + weight);
    }
    for (const kw of card.keywords ?? []) {
      if (EVERGREEN_KEYWORDS.has(kw)) continue;
      keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + weight);
    }
    for (const theme of SYNERGY_THEMES) {
      if (theme.test(card)) themeCounts.set(theme.key, (themeCounts.get(theme.key) ?? 0) + weight);
    }
  }

  const signals: SynergySignal[] = [];
  for (const [type, count] of tribalCounts) {
    if (count >= MIN_SIGNAL_WEIGHT) signals.push({ key: `tribal:${type}`, label: `${type} tribal`, kind: "tribal", count, scryfallClause: `t:${type} -t:legendary` });
  }
  for (const [kw, count] of keywordCounts) {
    if (count >= MIN_SIGNAL_WEIGHT) signals.push({ key: `kw:${kw}`, label: kw, kind: "keyword", count, scryfallClause: `kw:"${kw}"` });
  }
  for (const theme of SYNERGY_THEMES) {
    const count = themeCounts.get(theme.key) ?? 0;
    if (count >= MIN_SIGNAL_WEIGHT) signals.push({ key: theme.key, label: theme.label, kind: "theme", count, scryfallClause: theme.scryfallClause });
  }

  return signals.sort((a, b) => b.count - a.count).slice(0, MAX_SIGNALS);
}

export function cardMatchesSignal(card: ScryfallCard, signal: SynergySignal): boolean {
  if (signal.key.startsWith("tribal:")) return creatureSubtypes(card).includes(signal.key.slice("tribal:".length));
  if (signal.key.startsWith("kw:")) return (card.keywords ?? []).includes(signal.key.slice("kw:".length));
  return SYNERGY_THEMES.find((t) => t.key === signal.key)?.test(card) ?? false;
}

export interface SynergyGroup {
  key: string;
  label: string;
  reason: string;
  cards: ScryfallCard[];
}

const CARDS_PER_GROUP = 8;

function reasonFor(signal: SynergySignal): string {
  switch (signal.kind) {
    case "tribal":
      return `Your commander and/or deck lean into ${signal.label.replace(" tribal", "")} creatures — popular tribal support in your colors.`;
    case "keyword":
      return `${signal.label} shows up on your commander or multiple cards — more cards that use or enable it.`;
    default:
      return `Your deck cares about ${signal.label.toLowerCase()} — popular synergy pieces in your colors.`;
  }
}

export async function suggestSynergies(signals: SynergySignal[], colorIdentity: string[], excludeNames: Set<string>): Promise<SynergyGroup[]> {
  const exclude = new Set([...excludeNames].map((n) => n.toLowerCase()));
  const base = `id<=${colorIdentity.length ? colorIdentity.join("") : "c"} f:commander -is:funny game:paper`;

  const groups = await Promise.all(
    signals.map(async (signal) => {
      const { cards } = await searchAndCacheCards(`${base} ${signal.scryfallClause}`, { order: "edhrec", unique: "cards" });
      const filtered = cards.filter((c) => !exclude.has(c.name.toLowerCase())).slice(0, CARDS_PER_GROUP);
      if (filtered.length === 0) return null;
      return { key: signal.key, label: signal.label, reason: reasonFor(signal), cards: filtered };
    })
  );

  return groups.filter((g): g is SynergyGroup => g !== null);
}
