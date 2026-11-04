import { describe, expect, it } from "vitest";
import type { DeckCardEntry } from "./commander";
import { buildCardList, buildExport, CARD_LIST_FORMATS } from "./decklist-export";
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

describe("exporting a deck with a companion", () => {
  const deck = { commanders: [entry("Atraxa")], companions: [entry("Lurrus of the Dream-Den", 1, "iko", "226")], mainboard: [entry("Sol Ring")], maybeboard: [entry("Cyclonic Rift")] };
  const round = (text: string) => parseDecklist(text).map((l) => `${l.zone}:${l.name}`);

  it("gives the companion its own section (plain text, with set codes and Arena), which importing reads back", () => {
    const text = buildExport(deck, "text");
    expect(text).toContain("Companion\n1 Lurrus of the Dream-Den");
    expect(round(text)).toContain("companion:Lurrus of the Dream-Den");
    expect(buildExport(deck, "sets")).toContain("Companion\n1 Lurrus of the Dream-Den (IKO) 226");
    expect(buildExport(deck, "arena")).toContain("Companion\n1 Lurrus of the Dream-Den (IKO) 226");
    expect(round(buildExport(deck, "sets"))).toContain("companion:Lurrus of the Dream-Den");
  });

  it("goes in the sideboard for MTG Online and in its own zone in the CSV", () => {
    expect(buildExport(deck, "mtgo")).toContain("SB: 1 Lurrus of the Dream-Den");
    expect(buildExport(deck, "csv")).toContain("Companion,1,Lurrus of the Dream-Den,IKO,226,1.50");
  });

  it("leaves the section out when there's no companion", () => {
    expect(buildExport({ ...deck, companions: [] }, "text")).not.toContain("Companion");
  });
});
