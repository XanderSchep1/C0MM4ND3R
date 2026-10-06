import type { ScryfallCard } from "./scryfall-types";
import { cardOracleText, colorIdentityUnion, isBackground, isBasicLand, isLegalCommander, isWithinColorIdentity } from "./card-helpers";

export interface DeckCardEntry {
  card: ScryfallCard;
  quantity: number;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  totalCards: number;
  commanderCount: number;
  mainboardCount: number;
  colorIdentity: string[];
  issues: ValidationIssue[];
}

const ANY_NUMBER_NAMED_RE = /a deck can have any number of cards named/i;

function canBeUnlimited(card: ScryfallCard): boolean {
  return isBasicLand(card) || ANY_NUMBER_NAMED_RE.test(cardOracleText(card));
}

export function validateCommanderDeck(commanders: DeckCardEntry[], mainboard: DeckCardEntry[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const commanderCount = commanders.reduce((sum, e) => sum + e.quantity, 0);
  const mainboardCount = mainboard.reduce((sum, e) => sum + e.quantity, 0);
  const totalCards = commanderCount + mainboardCount;
  const colorIdentity = colorIdentityUnion(commanders.map((e) => e.card));

  if (commanders.length === 0) {
    issues.push({ severity: "error", message: "No commander selected." });
  } else if (commanders.length > 2) {
    issues.push({ severity: "error", message: "A commander deck can have at most two commanders (Partner or Background)." });
  } else if (commanders.length === 1) {
    const [{ card }] = commanders;
    if (!isLegalCommander(card)) {
      issues.push({ severity: "error", message: `${card.name} can't be a commander (not a legendary creature and has no "can be your commander" text).` });
    }
  } else {
    const [a, b] = commanders;
    const backgroundPair =
      (isBackground(a.card) && /choose a background/i.test(cardOracleText(b.card))) ||
      (isBackground(b.card) && /choose a background/i.test(cardOracleText(a.card)));
    const bothPartner = /\bpartner\b/i.test(cardOracleText(a.card)) && /\bpartner\b/i.test(cardOracleText(b.card));
    if (!backgroundPair && !bothPartner) {
      issues.push({
        severity: "warning",
        message: `${a.card.name} and ${b.card.name} may not be a legal commander pair — check for Partner or a Background.`,
      });
    }
    for (const { card } of commanders) {
      if (!isLegalCommander(card) && !isBackground(card)) {
        issues.push({ severity: "error", message: `${card.name} can't be a commander.` });
      }
    }
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

  return { totalCards, commanderCount, mainboardCount, colorIdentity, issues };
}
