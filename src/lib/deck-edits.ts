import type { CardMark } from "./card-mark";
import type { DeckCardEntry } from "./commander";
import type { ScryfallCard } from "./scryfall-types";
import { clampQuantity, MAX_DECK_ROWS } from "./limits";

// The browser applies each edit to its own copy of the deck the moment you click,
// then tells the server. These functions mirror what the API routes do (same quantity
// cap, same row cap, marks travelling with a card), so the two stay in step.
// Every function returns a new deck and leaves the one it was given untouched.

export type EditZone = "commander" | "mainboard" | "maybeboard";

export interface EditableDeck {
  commanders: DeckCardEntry[];
  mainboard: DeckCardEntry[];
  maybeboard: DeckCardEntry[];
}

const LIST = { commander: "commanders", mainboard: "mainboard", maybeboard: "maybeboard" } as const;

function withList<D extends EditableDeck>(deck: D, zone: EditZone, entries: DeckCardEntry[]): D {
  return { ...deck, [LIST[zone]]: entries };
}

export function findEntry(deck: EditableDeck, scryfallId: string, zone: EditZone): DeckCardEntry | undefined {
  return deck[LIST[zone]].find((e) => e.card.id === scryfallId);
}

export function rowCount(deck: EditableDeck): number {
  return deck.commanders.length + deck.mainboard.length + deck.maybeboard.length;
}

// Adds copies of a card (raising the quantity if it's already there). Returns null
// when the deck is already at its limit of different cards.
export function addToDeck<D extends EditableDeck>(deck: D, card: ScryfallCard, zone: EditZone, quantity = 1): D | null {
  const list = deck[LIST[zone]];
  const existing = list.find((e) => e.card.id === card.id);
  if (!existing) {
    if (rowCount(deck) >= MAX_DECK_ROWS) return null;
    return withList(deck, zone, [...list, { card, quantity: clampQuantity(quantity), mark: null }]);
  }
  return withList(deck, zone, list.map((e) => (e === existing ? { ...e, quantity: clampQuantity(e.quantity + quantity) } : e)));
}

export function removeFrom<D extends EditableDeck>(deck: D, scryfallId: string, zone: EditZone): D {
  return withList(deck, zone, deck[LIST[zone]].filter((e) => e.card.id !== scryfallId));
}

// A quantity of zero or less removes the card.
export function setQuantityIn<D extends EditableDeck>(deck: D, scryfallId: string, zone: EditZone, quantity: number): D {
  if (!(quantity > 0)) return removeFrom(deck, scryfallId, zone);
  return withList(deck, zone, deck[LIST[zone]].map((e) => (e.card.id === scryfallId ? { ...e, quantity: clampQuantity(quantity) } : e)));
}

// Moves the whole line to another zone. If the card is already there the two lines
// merge (keeping the target's mark); otherwise the mark travels with the card.
export function moveBetween<D extends EditableDeck>(deck: D, scryfallId: string, from: EditZone, to: EditZone): D {
  const entry = findEntry(deck, scryfallId, from);
  if (!entry || from === to) return deck;
  const without = removeFrom(deck, scryfallId, from);
  const target = findEntry(without, scryfallId, to);
  if (target) {
    return withList(without, to, without[LIST[to]].map((e) => (e === target ? { ...e, quantity: clampQuantity(e.quantity + entry.quantity) } : e)));
  }
  return withList(without, to, [...without[LIST[to]], entry]);
}

export function setMarkIn<D extends EditableDeck>(deck: D, scryfallId: string, zone: EditZone, mark: CardMark | null): D {
  return withList(deck, zone, deck[LIST[zone]].map((e) => (e.card.id === scryfallId ? { ...e, mark } : e)));
}

// Highlight order for the single button on each line: none -> yellow -> red -> none.
export function nextMark(current: CardMark | null | undefined): CardMark | null {
  if (!current) return "owned";
  return current === "owned" ? "missing" : null;
}
