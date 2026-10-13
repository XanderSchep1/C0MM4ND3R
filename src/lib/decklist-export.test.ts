import { describe, expect, it } from "vitest";
import type { DeckCardEntry } from "./commander";
import { buildCardList, CARD_LIST_FORMATS } from "./decklist-export";
import { parseDecklist } from "./decklist-parser";
import type { ScryfallCard } from "./scryfall-types";

const entry = (name: string, quantity = 1, set = "cmm", number = "7", usd: string | null = "1.50"): DeckCardEntry => ({
  card: { id: name, name, set, collector_number: number, prices: usd ? { usd } : {} } as unknown as ScryfallCard,
  quantity,
});

const list = [entry("Sol Ring", 1, "ltc", "284", "3.00"), entry("Arcane Signet", 2, "cmd", "250", null), entry('Card, "Quoted"', 1, "abc", "1", "0.10")];

describe("buildCardList", () => {
  it("plain text: one 'qty name' per line, alphabetical, no section headers", () => {
    expect(buildCardList(list, "text")).toBe('2 Arcane Signet\n1 Card, "Quoted"\n1 Sol Ring\n');
  });

  it("with set codes: adds the printing", () => {
    expect(buildCardList(list, "sets")).toBe('2 Arcane Signet (CMD) 250\n1 Card, "Quoted" (ABC) 1\n1 Sol Ring (LTC) 284\n');
  });

  it("csv: header, one row per card, quotes escaped, missing price left blank", () => {
    const lines = buildCardList(list, "csv").trimEnd().split("\n");
    expect(lines[0]).toBe("Quantity,Name,Set,Collector Number,Price USD");
    expect(lines[1]).toBe("2,Arcane Signet,CMD,250,");
    expect(lines[2]).toBe('1,"Card, ""Quoted""",ABC,1,0.10');
    expect(lines[3]).toBe("1,Sol Ring,LTC,284,3.00");
  });

  it("gives nothing for an empty list", () => {
    for (const f of CARD_LIST_FORMATS) expect(buildCardList([], f.value)).toBe("");
  });

  it("plain text reads straight back in with our own importer", () => {
    const parsed = parseDecklist(buildCardList([entry("Sol Ring", 1), entry("Arcane Signet", 3)], "text"));
    expect(parsed.map((p) => [p.quantity, p.name])).toEqual([[3, "Arcane Signet"], [1, "Sol Ring"]]);
  });

  it("does not change the order of the list it was given", () => {
    const copy = [...list];
    buildCardList(list, "text");
    expect(list.map((e) => e.card.name)).toEqual(copy.map((e) => e.card.name));
  });
});
