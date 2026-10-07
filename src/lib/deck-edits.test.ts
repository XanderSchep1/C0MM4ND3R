import { describe, expect, it } from "vitest";
import { addToDeck, findEntry, moveBetween, nextMark, removeFrom, rowCount, setMarkIn, setQuantityIn, type EditableDeck } from "./deck-edits";
import { MAX_CARD_QUANTITY, MAX_DECK_ROWS } from "./limits";
import type { ScryfallCard } from "./scryfall-types";

const card = (id: string, name = `Card ${id}`) => ({ id, name, type_line: "Artifact", cmc: 1, color_identity: [] }) as unknown as ScryfallCard;
const empty = (): EditableDeck => ({ commanders: [], mainboard: [], maybeboard: [] });

describe("addToDeck", () => {
  it("adds a new card with no mark, and raises the quantity of one already there", () => {
    let deck = addToDeck(empty(), card("a"), "mainboard")!;
    expect(deck.mainboard).toEqual([{ card: card("a"), quantity: 1, mark: null }]);
    deck = addToDeck(deck, card("a"), "mainboard", 2)!;
    expect(deck.mainboard).toHaveLength(1);
    expect(deck.mainboard[0].quantity).toBe(3);
  });

  it("caps quantity like the server does", () => {
    const deck = addToDeck(empty(), card("a"), "mainboard", 1e9)!;
    expect(deck.mainboard[0].quantity).toBe(MAX_CARD_QUANTITY);
    expect(addToDeck(deck, card("a"), "mainboard", 5)!.mainboard[0].quantity).toBe(MAX_CARD_QUANTITY);
  });

  it("puts cards in the zone it was told to", () => {
    const deck = addToDeck(addToDeck(empty(), card("c"), "commander")!, card("m"), "maybeboard")!;
    expect(deck.commanders.map((e) => e.card.id)).toEqual(["c"]);
    expect(deck.maybeboard.map((e) => e.card.id)).toEqual(["m"]);
    expect(deck.mainboard).toEqual([]);
  });

  it("refuses a new card once the deck is full, but still lets an existing one grow", () => {
    let deck = empty();
    for (let i = 0; i < MAX_DECK_ROWS; i++) deck = addToDeck(deck, card(`c${i}`), "mainboard")!;
    expect(rowCount(deck)).toBe(MAX_DECK_ROWS);
    expect(addToDeck(deck, card("one-too-many"), "mainboard")).toBeNull();
    expect(addToDeck(deck, card("c0"), "mainboard")!.mainboard[0].quantity).toBe(2);
  });

  it("never changes the deck it was given", () => {
    const before = addToDeck(empty(), card("a"), "mainboard")!;
    const snapshot = JSON.stringify(before);
    addToDeck(before, card("a"), "mainboard");
    addToDeck(before, card("b"), "mainboard");
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("removeFrom / setQuantityIn", () => {
  const deck = addToDeck(addToDeck(empty(), card("a"), "mainboard", 3)!, card("b"), "mainboard")!;

  it("removes only the named card", () => {
    expect(removeFrom(deck, "a", "mainboard").mainboard.map((e) => e.card.id)).toEqual(["b"]);
  });

  it("sets a quantity, and treats zero or less as removal", () => {
    expect(findEntry(setQuantityIn(deck, "a", "mainboard", 7), "a", "mainboard")?.quantity).toBe(7);
    expect(findEntry(setQuantityIn(deck, "a", "mainboard", 0), "a", "mainboard")).toBeUndefined();
    expect(findEntry(setQuantityIn(deck, "a", "mainboard", -2), "a", "mainboard")).toBeUndefined();
    expect(findEntry(setQuantityIn(deck, "a", "mainboard", 500), "a", "mainboard")?.quantity).toBe(MAX_CARD_QUANTITY);
  });
});

describe("moveBetween", () => {
  it("moves a line with its quantity and its mark", () => {
    let deck = addToDeck(empty(), card("a"), "mainboard", 2)!;
    deck = setMarkIn(deck, "a", "mainboard", "missing");
    const moved = moveBetween(deck, "a", "mainboard", "maybeboard");
    expect(moved.mainboard).toEqual([]);
    expect(moved.maybeboard).toEqual([{ card: card("a"), quantity: 2, mark: "missing" }]);
  });

  it("merges into a line that is already there, keeping that line's mark", () => {
    let deck = addToDeck(addToDeck(empty(), card("a"), "mainboard", 2)!, card("a"), "maybeboard", 1)!;
    deck = setMarkIn(setMarkIn(deck, "a", "mainboard", "missing"), "a", "maybeboard", "owned");
    const moved = moveBetween(deck, "a", "mainboard", "maybeboard");
    expect(moved.mainboard).toEqual([]);
    expect(moved.maybeboard).toEqual([{ card: card("a"), quantity: 3, mark: "owned" }]);
  });

  it("does nothing for a missing card or the same zone", () => {
    const deck = addToDeck(empty(), card("a"), "mainboard")!;
    expect(moveBetween(deck, "zzz", "mainboard", "maybeboard")).toBe(deck);
    expect(moveBetween(deck, "a", "mainboard", "mainboard")).toBe(deck);
  });
});

describe("marks", () => {
  it("sets and clears a mark on one line only", () => {
    const deck = addToDeck(addToDeck(empty(), card("a"), "mainboard")!, card("b"), "mainboard")!;
    const marked = setMarkIn(deck, "a", "mainboard", "owned");
    expect(findEntry(marked, "a", "mainboard")?.mark).toBe("owned");
    expect(findEntry(marked, "b", "mainboard")?.mark).toBeNull();
    expect(findEntry(setMarkIn(marked, "a", "mainboard", null), "a", "mainboard")?.mark).toBeNull();
  });

  it("cycles none -> yellow (owned) -> red (missing) -> none", () => {
    expect(nextMark(null)).toBe("owned");
    expect(nextMark(undefined)).toBe("owned");
    expect(nextMark("owned")).toBe("missing");
    expect(nextMark("missing")).toBeNull();
  });
});
