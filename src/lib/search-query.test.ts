import { describe, expect, it } from "vitest";
import { buildKeywordClause, buildTypeClause } from "./search-query";

describe("buildKeywordClause", () => {
  it("searches rules text for a plain word or phrase", () => {
    expect(buildKeywordClause("flying")).toBe('o:"flying"');
    expect(buildKeywordClause("  draw a card ")).toBe('o:"draw a card"');
  });

  it("leaves Scryfall syntax alone", () => {
    expect(buildKeywordClause("t:instant o:draw")).toBe("t:instant o:draw");
  });

  it("has nothing to search for an empty box", () => {
    expect(buildKeywordClause("   ")).toBe("");
  });
});

describe("buildTypeClause", () => {
  it("asks for one creature type", () => {
    expect(buildTypeClause("elf")).toBe('t:"elf"');
    expect(buildTypeClause("  Goblin ")).toBe('t:"Goblin"');
  });

  it("needs every word to be a type the card has", () => {
    expect(buildTypeClause("elf warrior")).toBe('t:"elf" t:"warrior"');
  });

  it("keeps hyphens and apostrophes, which real types have", () => {
    expect(buildTypeClause("Assembly-Worker")).toBe('t:"Assembly-Worker"');
    expect(buildTypeClause("Vau-N'Akat")).toBe('t:"Vau-N\'Akat"');
  });

  it("lets Changelings through, each inside its own brackets so more filters can follow safely", () => {
    expect(buildTypeClause("elf", { changelings: true })).toBe('(t:"elf" or keyword:changeling)');
    expect(buildTypeClause("elf warrior", { changelings: true })).toBe('(t:"elf" or keyword:changeling) (t:"warrior" or keyword:changeling)');
  });

  it("drops characters that could break the query out of its quotes or brackets", () => {
    expect(buildTypeClause('el"f) or (x')).toBe('t:"elf" t:"or" t:"x"');
    expect(buildTypeClause('"time lord"')).toBe('t:"time" t:"lord"');
    expect(buildTypeClause("- ( )")).toBe("");
  });

  it("leaves Scryfall syntax alone", () => {
    expect(buildTypeClause("t:elf", { changelings: true })).toBe("t:elf");
  });

  it("has nothing to search for an empty box", () => {
    expect(buildTypeClause("   ")).toBe("");
  });
});
