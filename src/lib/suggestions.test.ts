import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeckAnalysis } from "./deck-analysis";
import type { ScryfallCard } from "./scryfall-types";

const search = vi.hoisted(() => vi.fn());
vi.mock("./cards", () => ({ searchAndCacheCards: search }));

import { CARDS_PER_THEME, MAX_THEMES, suggestForGaps } from "./suggestions";

const cards = (n: number, prefix = "Card") => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, name: `${prefix} ${i}` }) as unknown as ScryfallCard);
const theme = (key: string, deficit = 3) => ({ key, label: key, count: 2, target: 2 + deficit, deficit, scryfallClause: `o:${key}` });

function analysisWith(themes: ReturnType<typeof theme>[], landDeficit = 0): DeckAnalysis {
  return { themes, landDeficit, landCount: 30, landTarget: 37 } as unknown as DeckAnalysis;
}

describe("suggestForGaps", () => {
  beforeEach(() => {
    search.mockReset();
    search.mockResolvedValue({ cards: cards(175), hasMore: true });
  });

  it("gives each gap a deep chapter, far more than the old 8 cards", async () => {
    const groups = await suggestForGaps(analysisWith([theme("ramp"), theme("draw")]), ["G"], new Set());
    expect(groups.map((g) => g.key)).toEqual(["ramp", "draw"]);
    for (const g of groups) expect(g.cards).toHaveLength(CARDS_PER_THEME);
    expect(CARDS_PER_THEME).toBeGreaterThan(15);
  });

  it("keeps cards already in the deck out of every chapter", async () => {
    const groups = await suggestForGaps(analysisWith([theme("ramp")]), ["G"], new Set(["card 0", "Card 1"]));
    const names = groups[0].cards.map((c) => c.name);
    expect(names).not.toContain("Card 0");
    expect(names).not.toContain("Card 1");
    expect(groups[0].cards).toHaveLength(CARDS_PER_THEME);
  });

  it("covers at most MAX_THEMES gaps, skips themes with no deficit, and adds a lands chapter when short on lands", async () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"].map((k) => theme(k));
    const groups = await suggestForGaps(analysisWith([...many, theme("full", 0)], 3), ["R", "G"], new Set());
    expect(groups.filter((g) => g.key !== "lands")).toHaveLength(MAX_THEMES);
    expect(groups.some((g) => g.key === "full")).toBe(false);
    expect(groups.at(-1)?.key).toBe("lands");
  });

  it("drops a chapter that has no cards", async () => {
    search.mockResolvedValueOnce({ cards: [], hasMore: false });
    const groups = await suggestForGaps(analysisWith([theme("ramp"), theme("draw")]), ["G"], new Set());
    expect(groups.map((g) => g.key)).toEqual(["draw"]);
  });
});
