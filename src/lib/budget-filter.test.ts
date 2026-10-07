import { describe, expect, it } from "vitest";
import { isExactNameMatch, normalizeName, splitByBudget } from "./budget-filter";

const card = (name: string, usd: number | null) => ({ name, usd });
const under = (max: number) => (c: { usd: number | null }) => c.usd === null || c.usd <= max;

describe("normalizeName", () => {
  it("ignores case, accents, apostrophes and punctuation", () => {
    expect(normalizeName("Wayfarer's Bauble")).toBe(normalizeName("wayfarers bauble"));
    expect(normalizeName("Wayfarer’s Bauble")).toBe(normalizeName("Wayfarer's Bauble"));
    expect(normalizeName("Lim-Dûl's Vault")).toBe("lim duls vault");
    expect(normalizeName("  Sol   Ring ")).toBe("sol ring");
  });
});

describe("isExactNameMatch", () => {
  it("matches a full name and either face of a double-faced card", () => {
    expect(isExactNameMatch("Rhythm of the Wild", "rhythm of the wild")).toBe(true);
    expect(isExactNameMatch("Fire // Ice", "ice")).toBe(true);
    expect(isExactNameMatch("Fire // Ice", "Fire // Ice")).toBe(true);
  });

  it("does not match partial names or an empty query", () => {
    expect(isExactNameMatch("Rhythm of the Wild", "rhythm")).toBe(false);
    expect(isExactNameMatch("Rhythm of the Wild", "")).toBe(false);
    expect(isExactNameMatch("Rhythm of the Wild", "   ")).toBe(false);
  });
});

describe("splitByBudget", () => {
  const results = [card("Nature's Rhythm", 1.2), card("Rhythm of the Wild", 5.19), card("Biorhythm", 3), card("Rhythm Vault", 40)];

  it("hides over-budget cards but returns them so the page can say so", () => {
    const { shown, hidden } = splitByBudget(results, under(5), "rhythm");
    expect(shown.map((c) => c.name)).toEqual(["Nature's Rhythm", "Biorhythm"]);
    expect(hidden.map((c) => c.name)).toEqual(["Rhythm of the Wild", "Rhythm Vault"]);
  });

  it("always shows a card searched for by its full name, first, whatever it costs", () => {
    const { shown, hidden } = splitByBudget(results, under(5), "Rhythm of the Wild");
    expect(shown.map((c) => c.name)).toEqual(["Rhythm of the Wild", "Nature's Rhythm", "Biorhythm"]);
    expect(hidden.map((c) => c.name)).toEqual(["Rhythm Vault"]);
  });

  it("keeps cards with no known price, like the rest of the budget filter", () => {
    expect(splitByBudget([card("New Card", null)], under(1), "").shown).toHaveLength(1);
  });

  it("hides nothing when there is no limit, and keeps the original order", () => {
    const { shown, hidden } = splitByBudget(results, () => true, "something else");
    expect(hidden).toEqual([]);
    expect(shown).toEqual(results);
  });
});
