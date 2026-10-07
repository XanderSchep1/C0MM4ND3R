import { validateCommanderDeck, type DeckCardEntry } from "./commander";
import { analyzeDeck, calculatePriceTotal, estimatePowerLevel } from "./deck-analysis";
import { analyzeAnnoyance } from "./annoyance";
import { colorIdentityUnion } from "./card-helpers";

// Everything the deck page shows about a deck, worked out from its cards alone.
// It's all pure, so the server uses it for the first page load and the browser
// re-runs it after every edit — the stats update the instant a card is added.
export function computeDeckStats(deck: { commanders: DeckCardEntry[]; mainboard: DeckCardEntry[] }) {
  const validation = validateCommanderDeck(deck.commanders, deck.mainboard);
  const colorIdentity = colorIdentityUnion(deck.commanders.map((c) => c.card));
  const analysis = analyzeDeck(deck.mainboard, colorIdentity);
  const ownedCards = [...deck.commanders, ...deck.mainboard];
  return {
    validation,
    colorIdentity,
    analysis,
    powerLevel: estimatePowerLevel(ownedCards),
    priceTotal: calculatePriceTotal(ownedCards),
    annoyance: analyzeAnnoyance(deck.mainboard),
  };
}

export type DeckStats = ReturnType<typeof computeDeckStats>;
