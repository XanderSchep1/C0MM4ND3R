import { priceValue } from "./card-helpers";
import type { ScryfallCard } from "./scryfall-types";

// Scryfall ids are UUIDs. The oracle id goes straight into a Scryfall search query, so anything that
// isn't exactly a UUID must never get that far.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isOracleId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

// Every paper printing of one card (same rules text, different set / art / price).
export const printingsQuery = (oracleId: string) => `oracleid:${oracleId} game:paper`;

// Two printings are "the same card" when they share an oracle id (or, for the odd layout without one, a name).
export function isSameCard(a: Pick<ScryfallCard, "oracle_id" | "name">, b: Pick<ScryfallCard, "oracle_id" | "name">): boolean {
  if (a.oracle_id && b.oracle_id) return a.oracle_id === b.oracle_id;
  return a.name === b.name;
}

// "Commander Legends · 2020" — enough to tell printings apart at a glance.
export function printingLabel(card: Pick<ScryfallCard, "set_name" | "set" | "released_at">): string {
  const year = card.released_at?.slice(0, 4);
  const name = card.set_name ?? card.set.toUpperCase();
  return year ? `${name} · ${year}` : name;
}

// The least expensive printing with a known price (ties go to the earlier one in the list), or null.
export function cheapestPrinting<T extends Pick<ScryfallCard, "prices" | "name" | "type_line">>(printings: T[]): T | null {
  let best: T | null = null;
  let bestPrice = Infinity;
  for (const p of printings) {
    const price = priceValue(p);
    if (price !== null && price < bestPrice) {
      best = p;
      bestPrice = price;
    }
  }
  return best;
}
