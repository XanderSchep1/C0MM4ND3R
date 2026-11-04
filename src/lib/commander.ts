import type { ScryfallCard } from "./scryfall-types";
import type { CardMark } from "./card-mark";
import { cardOracleText, colorIdentityUnion, isBackground, isBasicLand, isLegalCommander, isWithinColorIdentity } from "./card-helpers";
import { canPair } from "./commander-pairs";
import { companionIssues, isCompanion } from "./companion";

export interface DeckCardEntry {
  card: ScryfallCard;
  quantity: number;
  // Only set for the deck's owner; see resolveDeck.
  mark?: CardMark | null;
  // Who suggested this card (a friend invited to the deck); null/absent for the owner's own cards.
  addedBy?: { id: string; name: string } | null;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  totalCards: number;
  commanderCount: number;
  mainboardCount: number;
  // 0 or 1: the companion sits outside the 100 cards.
  companionCount: number;
  colorIdentity: string[];
  issues: ValidationIssue[];
}

const ANY_NUMBER_NAMED_RE = /a deck can have any number of cards named/i;

function canBeUnlimited(card: ScryfallCard): boolean {
  return isBasicLand(card) || ANY_NUMBER_NAMED_RE.test(cardOracleText(card));
}

export function validateCommanderDeck(commanders: DeckCardEntry[], mainboard: DeckCardEntry[], companions: DeckCardEntry[] = []): ValidationResult {
  const issues: ValidationIssue[] = [];
  const commanderCount = commanders.reduce((sum, e) => sum + e.quantity, 0);
  const mainboardCount = mainboard.reduce((sum, e) => sum + e.quantity, 0);
  const companionCount = companions.reduce((sum, e) => sum + e.quantity, 0);
  const totalCards = commanderCount + mainboardCount;
  const colorIdentity = colorIdentityUnion(commanders.map((e) => e.card));

  if (commanders.length === 0) {
    issues.push({ severity: "error", message: "No commander selected." });
  } else if (commanders.length > 2) {
    issues.push({ severity: "error", message: "A commander deck can have at most two commanders (Partner, a Background, a Doctor's companion...)." });
  } else if (commanders.length === 1) {
    const [{ card }] = commanders;
    if (!isLegalCommander(card)) {
      issues.push({
        severity: "error",
        message: isBackground(card)
          ? `${card.name} is a Background: it needs a commander with Choose a Background as its partner.`
          : `${card.name} can't be a commander (not a legendary creature and has no "can be your commander" text).`,
      });
    }
  } else {
    const [a, b] = commanders;
    const pair = canPair(a.card, b.card);
    if (!pair.ok) {
      // A card with no pairing ability we recognise might have one we don't know yet, so that case only warns.
      issues.push(
        pair.known
          ? { severity: "error", message: `${a.card.name} and ${b.card.name} can't be commanders together. ${pair.reason}` }
          : { severity: "warning", message: `${a.card.name} and ${b.card.name} may not be a legal commander pair — neither has Partner, a Background or similar.` }
      );
    }
    for (const { card } of commanders) {
      if (!isLegalCommander(card) && !isBackground(card)) {
        issues.push({ severity: "error", message: `${card.name} can't be a commander.` });
      }
    }
  }

  if (companions.length > 1) {
    issues.push({ severity: "error", message: "A deck can have only one companion." });
  }
  for (const { card } of companions.slice(0, 1)) {
    if (!isCompanion(card)) {
      issues.push({ severity: "error", message: `${card.name} isn't a companion.` });
      continue;
    }
    if (commanders.length > 0 && !isWithinColorIdentity(card, colorIdentity)) {
      issues.push({
        severity: "error",
        message: `Your companion ${card.name} (${card.color_identity.join("") || "C"}) is outside your commander's color identity (${colorIdentity.join("") || "C"}).`,
      });
    }
    if (card.legalities?.commander && card.legalities.commander !== "legal") {
      issues.push({ severity: "error", message: `Your companion ${card.name} is ${card.legalities.commander.replace("_", " ")} in Commander.` });
    }
    for (const message of companionIssues(card, [...commanders, ...mainboard])) issues.push({ severity: "warning", message });
  }

  if (totalCards !== 100) {
    issues.push({ severity: "error", message: `Deck has ${totalCards} card${totalCards === 1 ? "" : "s"}, but Commander decks need exactly 100.` });
  }

  const nameCounts = new Map<string, { qty: number; card: ScryfallCard }>();
  for (const entry of [...commanders, ...mainboard]) {
    const key = entry.card.name;
    const existing = nameCounts.get(key);
    nameCounts.set(key, { qty: (existing?.qty ?? 0) + entry.quantity, card: entry.card });
  }
  for (const { qty, card } of nameCounts.values()) {
    if (qty > 1 && !canBeUnlimited(card)) {
      issues.push({ severity: "error", message: `${card.name} appears ${qty} times — Commander is singleton (basic lands excepted).` });
    }
  }

  for (const entry of [...commanders, ...mainboard]) {
    if (!isWithinColorIdentity(entry.card, colorIdentity)) {
      issues.push({
        severity: "error",
        message: `${entry.card.name} (${entry.card.color_identity.join("") || "C"}) is outside your commander's color identity (${colorIdentity.join("") || "C"}).`,
      });
    }
    const legality = entry.card.legalities?.commander;
    if (legality && legality !== "legal") {
      issues.push({ severity: "error", message: `${entry.card.name} is ${legality.replace("_", " ")} in Commander.` });
    }
  }

  return { totalCards, commanderCount, mainboardCount, companionCount, colorIdentity, issues };
}
