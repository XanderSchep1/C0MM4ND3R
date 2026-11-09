import { describe, expect, it } from "vitest";
import { pickType, suggestTypes } from "./creature-types";

const TYPES = ["Elf", "Elemental", "Eldrazi", "Goblin", "Human", "Inhuman", "Shaman", "Time Lord", "Warrior", "Wizard", "Assembly-Worker"];

describe("suggestTypes", () => {
  it("offers the types that start with what is typed, then those that only contain it", () => {
    expect(suggestTypes(TYPES, "el")).toEqual(["Elf", "Elemental", "Eldrazi"]);
    // "Inhuman" comes before "Shaman" in the list, but only "Human" starts with "hum".
    expect(suggestTypes(["Inhuman", "Human", "Humanoid"], "hum")).toEqual(["Human", "Humanoid", "Inhuman"]);
    expect(suggestTypes(TYPES, "man")).toEqual(["Human", "Inhuman", "Shaman"]);
  });

  it("goes by the word being typed, so a second type gets its own picks", () => {
    expect(suggestTypes(TYPES, "elf war")).toEqual(["Warrior"]);
  });

  it("matches without caring about case", () => {
    expect(suggestTypes(TYPES, "GOB")).toEqual(["Goblin"]);
  });

  it("does not offer back exactly what was typed", () => {
    expect(suggestTypes(TYPES, "goblin")).toEqual([]);
    expect(suggestTypes(TYPES, "time lord")).toEqual([]);
    expect(suggestTypes(TYPES, "human")).toEqual(["Inhuman"]);
  });

  it("waits for two letters, and offers nothing for an empty box", () => {
    expect(suggestTypes(TYPES, "e")).toEqual([]);
    expect(suggestTypes(TYPES, "  ")).toEqual([]);
  });

  it("offers at most `limit` picks", () => {
    expect(suggestTypes(TYPES, "el", 1)).toEqual(["Elf"]);
  });
});

describe("pickType", () => {
  it("replaces the word being typed", () => {
    expect(pickType("gob", "Goblin")).toBe("Goblin");
    expect(pickType("elf war", "Warrior")).toBe("elf Warrior");
  });

  it("starts the text with the type when the box is empty", () => {
    expect(pickType("", "Elf")).toBe("Elf");
  });

  it("lets a type of two words replace the two words it covers", () => {
    expect(pickType("time lord", "Time Lord")).toBe("Time Lord");
    expect(pickType("elf lord", "Time Lord")).toBe("elf Time Lord");
    expect(pickType("elf time", "Time Lord")).toBe("elf Time Lord");
  });
});
