import { describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({ prisma: {} }));
vi.mock("./cards", () => ({
  getCardsByIds: async (ids: string[]) => new Map(ids.map((id) => [id, { id, name: `Card ${id}`, type_line: "Artifact", cmc: 1, color_identity: [] }])),
}));

import { resolveDeck } from "./deck-data";

const deck = {
  id: "d1",
  name: "Test",
  format: "commander",
  description: null,
  public: true,
  cards: [
    { scryfallId: "a", name: "A", quantity: 1, zone: "mainboard", mark: "owned" },
    { scryfallId: "b", name: "B", quantity: 1, zone: "maybeboard", mark: "missing" },
    { scryfallId: "c", name: "C", quantity: 1, zone: "mainboard", mark: "bogus" },
    { scryfallId: "d", name: "D", quantity: 1, zone: "mainboard", mark: null },
  ],
};

describe("resolveDeck marks", () => {
  it("leaves the owner's highlights out unless asked, so shared pages cannot leak them", async () => {
    const resolved = await resolveDeck(deck);
    for (const entry of [...resolved.mainboard, ...resolved.maybeboard]) expect(entry).not.toHaveProperty("mark");
    expect(JSON.stringify(resolved)).not.toMatch(/owned|missing/);
  });

  it("includes valid marks for the owner's view and ignores unknown values", async () => {
    const resolved = await resolveDeck(deck, { withMarks: true });
    const marks = Object.fromEntries([...resolved.mainboard, ...resolved.maybeboard].map((e) => [e.card.id, e.mark]));
    expect(marks).toEqual({ a: "owned", b: "missing", c: null, d: null });
  });
});

describe("resolveDeck companion", () => {
  it("keeps the companion out of the mainboard and the commanders", async () => {
    const resolved = await resolveDeck({
      ...deck,
      cards: [
        { scryfallId: "cmd", name: "Cmd", quantity: 1, zone: "commander" },
        { scryfallId: "lurrus", name: "Lurrus", quantity: 1, zone: "companion" },
        { scryfallId: "a", name: "A", quantity: 1, zone: "mainboard" },
      ],
    });
    expect(resolved.companions.map((e) => e.card.id)).toEqual(["lurrus"]);
    expect(resolved.commanders.map((e) => e.card.id)).toEqual(["cmd"]);
    expect(resolved.mainboard.map((e) => e.card.id)).toEqual(["a"]);
  });

  it("is an empty list for a deck without one", async () => {
    expect((await resolveDeck(deck)).companions).toEqual([]);
  });
});
