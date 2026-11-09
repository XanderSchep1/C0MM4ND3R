import { describe, expect, it } from "vitest";
import { analyzeDeck } from "./deck-analysis";
import type { ScryfallCard } from "./scryfall-types";

const entry = (name: string, type_line: string, quantity = 1) => ({ card: { id: name, name, type_line, cmc: 2 } as unknown as ScryfallCard, quantity });

describe("analyzeDeck: creature types", () => {
  it("counts the creatures of each type, most common first, ties by name", () => {
    const { creatureTypes } = analyzeDeck(
      [
        entry("Llanowar Elves", "Creature — Elf Druid"),
        entry("Elvish Mystic", "Creature — Elf Druid"),
        entry("Imperious Perfect", "Creature — Elf Warrior"),
        entry("Goblin Guide", "Creature — Goblin Scout"),
      ],
      []
    );
    expect(creatureTypes).toEqual([
      { type: "Elf", count: 3 },
      { type: "Druid", count: 2 },
      { type: "Goblin", count: 1 },
      { type: "Scout", count: 1 },
      { type: "Warrior", count: 1 },
    ]);
  });

  it("counts every copy", () => {
    expect(analyzeDeck([entry("Relentless Rats", "Creature — Rat", 4)], []).creatureTypes).toEqual([{ type: "Rat", count: 4 }]);
  });

  it("leaves out cards that aren't creatures, even when they have a type after the dash", () => {
    const { creatureTypes } = analyzeDeck(
      [entry("Sol Ring", "Artifact"), entry("Forest", "Basic Land — Forest"), entry("Fireball", "Kindred Instant — Elf"), entry("Jitte", "Artifact — Equipment"), entry("Llanowar Elves", "Creature — Elf Druid")],
      []
    );
    expect(creatureTypes).toEqual([
      { type: "Druid", count: 1 },
      { type: "Elf", count: 1 },
    ]);
  });

  it("takes the types of the front face of a double-faced card", () => {
    const { creatureTypes } = analyzeDeck([entry("Delver of Secrets // Insectile Aberration", "Creature — Human Wizard // Creature — Human Insect")], []);
    expect(creatureTypes).toEqual([
      { type: "Human", count: 1 },
      { type: "Wizard", count: 1 },
    ]);
  });

  it("has none for a deck without creatures", () => {
    expect(analyzeDeck([], []).creatureTypes).toEqual([]);
    expect(analyzeDeck([entry("Sol Ring", "Artifact")], []).creatureTypes).toEqual([]);
  });
});
