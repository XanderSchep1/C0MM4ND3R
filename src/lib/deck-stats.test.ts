import { describe, expect, it } from "vitest";
import { addToDeck, type EditableDeck } from "./deck-edits";
import { computeDeckStats } from "./deck-stats";
import type { ScryfallCard } from "./scryfall-types";

const card = (id: string, extra: Partial<ScryfallCard> = {}) =>
  ({ id, name: `Card ${id}`, type_line: "Artifact", cmc: 2, color_identity: [], oracle_text: "", prices: { usd: "1.50" }, ...extra }) as unknown as ScryfallCard;

describe("computeDeckStats", () => {
  it("changes as soon as a card is added, without a trip to the server", () => {
    const empty: EditableDeck = { commanders: [], mainboard: [], maybeboard: [] };
    const before = computeDeckStats(empty);
    expect(before.validation.issues.some((i) => /commander/i.test(i.message))).toBe(true);

    const deck = addToDeck(addToDeck(empty, card("cmd", { type_line: "Legendary Creature — Human" }), "commander")!, card("rock"), "mainboard", 3)!;
    const after = computeDeckStats(deck);
    expect(after.priceTotal.usd).toBeCloseTo(6, 1); // 1.50 commander + 3 x 1.50
    expect(after.analysis.nonlandCount).toBe(3);
    expect(after.validation.issues.some((i) => /No commander/i.test(i.message))).toBe(false);
  });

  it("ignores the maybeboard", () => {
    const deck: EditableDeck = { commanders: [], mainboard: [], maybeboard: [{ card: card("maybe"), quantity: 1, mark: null }] };
    expect(computeDeckStats(deck).analysis.nonlandCount).toBe(0);
  });
});
