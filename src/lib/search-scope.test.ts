import { describe, expect, it } from "vitest";
import { searchScope } from "./search-scope";
import type { ScryfallCard } from "./scryfall-types";

const commander = (...identity: string[]) => ({ color_identity: identity }) as unknown as ScryfallCard;

describe("searchScope", () => {
  it("says 'none' while the deck has no commander", () => {
    expect(searchScope([])).toBe("none");
  });

  it("is the commander's colours in WUBRG order", () => {
    expect(searchScope([commander("G", "B")])).toBe("BG");
  });

  it("is 'c' for a colourless commander", () => {
    expect(searchScope([commander()])).toBe("c");
  });

  it("combines partners", () => {
    expect(searchScope([commander("R"), commander("U", "R")])).toBe("UR");
  });
});
