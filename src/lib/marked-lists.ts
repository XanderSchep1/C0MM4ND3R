import type { CardMark } from "./card-mark";
import type { DeckCardEntry } from "./commander";
import type { ScryfallCard } from "./scryfall-types";

// The cards behind the "Owned" and "Missing" chips above a deck list.
//  - Owned: the lines highlighted yellow.
//  - Missing: the lines highlighted red, plus, once the person has a collection, every line they haven't
//    highlighted that the collection doesn't cover (the same cards that get a "Need" badge), listed with
//    only the copies still needed. `ownedCopies` is null while there is no collection to compare with.
export function entriesForMark(entries: DeckCardEntry[], mark: CardMark, ownedCopies: ((card: ScryfallCard) => number) | null): DeckCardEntry[] {
  if (mark === "owned") return entries.filter((e) => e.mark === "owned");
  return entries.flatMap((e) => {
    if (e.mark === "missing") return [e];
    if (e.mark || !ownedCopies) return [];
    const need = e.quantity - ownedCopies(e.card);
    return need > 0 ? [{ ...e, quantity: need }] : [];
  });
}
