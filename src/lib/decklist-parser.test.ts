import { describe, expect, it } from "vitest";
import { parseDecklist } from "./decklist-parser";

describe("parseDecklist", () => {
  it("reads quantities in the common formats", () => {
    expect(parseDecklist("2 Sol Ring\n3x Island\nCounterspell")).toEqual([
      { quantity: 2, name: "Sol Ring", zone: "mainboard" },
      { quantity: 3, name: "Island", zone: "mainboard" },
      { quantity: 1, name: "Counterspell", zone: "mainboard" },
    ]);
  });

  it("strips set and collector annotations from Moxfield-style exports", () => {
    const [a, b] = parseDecklist("1 Sol Ring (LTC) 25\n1 Arcane Signet [CMD]");
    expect(a.name).toBe("Sol Ring");
    expect(b.name).toBe("Arcane Signet");
  });

  it("tracks section headers and prefixes", () => {
    const lines = parseDecklist("Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n\nMaybeboard\n1 Cyclonic Rift\nSB: 1 Counterspell\nCommander: 1 Kenrith, the Returned King");
    expect(lines.map((l) => [l.name, l.zone])).toEqual([
      ["Atraxa, Praetors' Voice", "commander"],
      ["Sol Ring", "mainboard"],
      ["Cyclonic Rift", "maybeboard"],
      ["Counterspell", "maybeboard"],
      ["Kenrith, the Returned King", "commander"],
    ]);
  });

  it("skips comments and blank lines", () => {
    expect(parseDecklist("// a comment\n# another\n\n   \n1 Sol Ring")).toHaveLength(1);
  });

  it("caps absurd quantities", () => {
    expect(parseDecklist(`${"9".repeat(150)} Sol Ring`)[0].quantity).toBe(9999);
  });

  it("ignores overlong lines and stays fast on pathological input", () => {
    const evil = `1 Sol${" ".repeat(50_000)}(`;
    const start = performance.now();
    const lines = parseDecklist(`${evil}\n1 Island`);
    expect(performance.now() - start).toBeLessThan(500);
    expect(lines).toEqual([{ quantity: 1, name: "Island", zone: "mainboard" }]);
  });
});

describe("companion", () => {
  it("reads a Companion section, however it's titled", () => {
    const lines = parseDecklist("Commander\n1 Atraxa, Praetors' Voice\n\nCompanion\n1 Lurrus of the Dream-Den\n\nDeck\n1 Sol Ring");
    expect(lines).toEqual([
      { quantity: 1, name: "Atraxa, Praetors' Voice", zone: "commander" },
      { quantity: 1, name: "Lurrus of the Dream-Den", zone: "companion" },
      { quantity: 1, name: "Sol Ring", zone: "mainboard" },
    ]);
    expect(parseDecklist("Companions:\n1 Lurrus of the Dream-Den")[0].zone).toBe("companion");
  });

  it("reads a Companion: prefix on a single line", () => {
    expect(parseDecklist("Companion: 1 Lurrus of the Dream-Den")).toEqual([{ quantity: 1, name: "Lurrus of the Dream-Den", zone: "companion" }]);
  });
});
