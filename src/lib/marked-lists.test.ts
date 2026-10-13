import { describe, expect, it } from "vitest";
import type { CardMark } from "./card-mark";
import type { DeckCardEntry } from "./commander";
import { entriesForMark } from "./marked-lists";
import type { ScryfallCard } from "./scryfall-types";

const entry = (name: string, quantity = 1, mark: CardMark | null = null): DeckCardEntry => ({
  card: { id: name, name } as unknown as ScryfallCard,
  quantity,
  mark,
});

const sol = entry("Sol Ring", 1, "owned");
const bolt = entry("Lightning Bolt", 1, "missing");
const cultivate = entry("Cultivate", 1);
const signet = entry("Arcane Signet", 3);
const forest = entry("Forest", 10);
const deck = [sol, bolt, cultivate, signet, forest];

// A collection with 1 Arcane Signet, unlimited basics, nothing else.
const collection = (card: ScryfallCard) => (card.name === "Forest" ? Number.POSITIVE_INFINITY : card.name === "Arcane Signet" ? 1 : 0);

describe("entriesForMark", () => {
  it("owned: only the lines highlighted yellow", () => {
    expect(entriesForMark(deck, "owned", collection)).toEqual([sol]);
  });

  it("missing without a collection: only the lines highlighted red", () => {
    expect(entriesForMark(deck, "missing", null)).toEqual([bolt]);
  });

  it("missing with a collection: red lines plus unhighlighted cards the collection doesn't cover", () => {
    const names = entriesForMark(deck, "missing", collection).map((e) => e.card.name);
    expect(names).toEqual(["Lightning Bolt", "Cultivate", "Arcane Signet"]);
  });

  it("lists only the copies still needed, and keeps a red line's full quantity", () => {
    const missing = entriesForMark([entry("Sol Ring", 2, "missing"), signet], "missing", collection);
    expect(missing.map((e) => [e.card.name, e.quantity])).toEqual([
      ["Sol Ring", 2],
      ["Arcane Signet", 2],
    ]);
  });

  it("never lists a yellow line as missing, even if the collection lacks it", () => {
    expect(entriesForMark([sol], "missing", collection)).toEqual([]);
  });

  it("basic lands are never missing, and the original entries are left untouched", () => {
    expect(entriesForMark([forest], "missing", collection)).toEqual([]);
    entriesForMark([signet], "missing", collection);
    expect(signet.quantity).toBe(3);
  });
});
