// Size caps shared by the deck and import endpoints. They sit well above what a
// real Commander deck needs; they exist so a script can't bloat the database or
// fan out hundreds of Scryfall lookups from one request.

export const MAX_CARD_QUANTITY = 99;
export const MAX_DECK_NAME = 100;
export const MAX_DECK_DESCRIPTION = 2000;
export const MAX_DECKS_PER_USER = 100;
// Distinct cards per deck (all zones). A 100-card deck plus a roomy maybeboard.
export const MAX_DECK_ROWS = 400;
export const MAX_IMPORT_CHARS = 30_000;
export const MAX_IMPORT_LINES = 500;
// How many cards one friend can have waiting in a deck's Maybeboard at once.
export const MAX_SUGGESTIONS_PER_FRIEND = 60;
// Names the exact-match lookup misses each cost one fuzzy Scryfall call.
export const MAX_FUZZY_LOOKUPS = 20;

export function clampQuantity(value: number, min = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(MAX_CARD_QUANTITY, Math.max(min, Math.floor(value)));
}
