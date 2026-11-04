import type { DeckCardEntry } from "./commander";
import type { ScryfallCard } from "./scryfall-types";

// A Companion sits outside the 100 cards, and each of the ten has a deck-building rule printed after
// "Companion —". We check the rules that can be worked out from the cards themselves and report a miss as a
// warning (never an error: the text is the authority, and the check treats your commander as part of the
// deck, as the rules do). Zirda's "every permanent has an activated ability" can't be read reliably, so
// it is shown to the player as the rule to check instead.

export function isCompanion(card: ScryfallCard): boolean {
  return (card.keywords ?? []).includes("Companion");
}

// The rule printed after "Companion —", without the reminder text: "Each permanent card in your starting deck
// has mana value 2 or less."
export function companionCondition(card: ScryfallCard): string | null {
  const texts = card.oracle_text ? [card.oracle_text] : (card.card_faces ?? []).map((f) => f.oracle_text ?? "");
  for (const line of texts.flatMap((t) => t.split("\n"))) {
    const match = line.match(/^Companion\s*—\s*([^(]+?)\s*(?:\(|$)/);
    if (match) return match[1].trim();
  }
  return null;
}

const CARD_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Instant", "Kindred", "Land", "Planeswalker", "Sorcery", "Tribal"];

// A double-faced card is judged by its front face, as it is in the library.
const front = (typeLine: string | undefined) => (typeLine ?? "").split(" // ")[0];
const typesOf = (card: ScryfallCard) => front(card.type_line).split("—")[0].split(/\s+/).filter((t) => CARD_TYPES.includes(t));
const subtypesOf = (card: ScryfallCard) => (front(card.type_line).split("—")[1] ?? "").split(/\s+/).filter(Boolean);
const isLand = (card: ScryfallCard) => typesOf(card).includes("Land");
const isPermanent = (card: ScryfallCard) => !typesOf(card).some((t) => t === "Instant" || t === "Sorcery");
const manaCost = (card: ScryfallCard) => card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? "";

type Check = (entries: DeckCardEntry[]) => DeckCardEntry[];
const where = (test: (card: ScryfallCard) => boolean): Check => (entries) => entries.filter((e) => test(e.card));

const KAHEERA_TYPES = ["Cat", "Elemental", "Nightmare", "Dinosaur", "Beast"];

// Each check returns the cards that break the rule.
const CHECKS: Record<string, Check> = {
  "Gyruda, Doom of Depths": where((c) => c.cmc % 2 !== 0),
  "Obosh, the Preypiercer": where((c) => !isLand(c) && c.cmc % 2 === 0),
  "Keruga, the Macrosage": where((c) => !isLand(c) && c.cmc < 3),
  "Lurrus of the Dream-Den": where((c) => isPermanent(c) && c.cmc > 2),
  "Jegantha, the Wellspring": where((c) => {
    const symbols = manaCost(c).match(/\{[^}]+\}/g) ?? [];
    return new Set(symbols).size !== symbols.length;
  }),
  "Kaheera, the Orphanguard": where((c) => typesOf(c).includes("Creature") && !(c.keywords ?? []).includes("Changeling") && !subtypesOf(c).some((t) => KAHEERA_TYPES.includes(t))),
  "Lutri, the Spellchaser": (entries) => {
    const counts = new Map<string, number>();
    for (const e of entries.filter((e) => !isLand(e.card))) counts.set(e.card.name, (counts.get(e.card.name) ?? 0) + e.quantity);
    return entries.filter((e) => !isLand(e.card) && (counts.get(e.card.name) ?? 0) > 1);
  },
  "Umori, the Collector": (entries) => {
    const nonland = entries.filter((e) => !isLand(e.card));
    const tally = new Map<string, number>();
    for (const e of nonland) for (const t of new Set(typesOf(e.card))) tally.set(t, (tally.get(t) ?? 0) + 1);
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] === nonland.length) return [];
    // No single type is shared: the cards missing the most common one are the ones to look at.
    return nonland.filter((e) => !typesOf(e.card).includes(best[0]));
  },
};

function listNames(offenders: DeckCardEntry[]): string {
  const names = [...new Set(offenders.map((e) => e.card.name))];
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

// `deck` is every card of the deck proper: the commander(s) and the mainboard.
export function companionIssues(companion: ScryfallCard, deck: DeckCardEntry[]): string[] {
  const condition = companionCondition(companion);
  const rule = condition ? ` "${condition}"` : "";
  if (companion.name === "Yorion, Sky Nomad") {
    return [`${companion.name} needs a deck at least twenty cards over the minimum, which a 100-card Commander deck can't be.${rule}`];
  }
  const check = CHECKS[companion.name];
  if (!check) return [];
  const offenders = check(deck.filter((e) => e.card.id !== companion.id));
  if (offenders.length === 0) return [];
  return [`${companion.name} can't be your companion yet: ${listNames(offenders)} break${offenders.length === 1 && offenders[0].quantity === 1 ? "s" : ""} its deck rule.${rule}`];
}
