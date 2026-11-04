import { describe, expect, it } from "vitest";
import { isLegalCommander } from "./card-helpers";
import type { ScryfallCard } from "./scryfall-types";

const card = (extra: Partial<ScryfallCard>) => ({ id: "x", name: "X", type_line: "Artifact", ...extra }) as unknown as ScryfallCard;

describe("isLegalCommander", () => {
  it("accepts legendary creatures", () => {
    expect(isLegalCommander(card({ type_line: "Legendary Creature — Human Wizard" }))).toBe(true);
    expect(isLegalCommander(card({ type_line: "Legendary Artifact Creature — Golem" }))).toBe(true);
    expect(isLegalCommander(card({ type_line: "Creature — Human" }))).toBe(false);
  });

  it("accepts cards that say they can be your commander", () => {
    expect(isLegalCommander(card({ type_line: "Legendary Planeswalker — Teferi", oracle_text: "Teferi can be your commander." }))).toBe(true);
  });

  it("accepts legendary Vehicles and Spacecraft that have a power and toughness", () => {
    expect(isLegalCommander(card({ type_line: "Legendary Artifact — Vehicle", power: "4", toughness: "3" }))).toBe(true);
    expect(isLegalCommander(card({ type_line: "Legendary Artifact — Spacecraft", power: "5", toughness: "5" }))).toBe(true);
    expect(isLegalCommander(card({ type_line: "Legendary Artifact — Vehicle" }))).toBe(false);
    expect(isLegalCommander(card({ type_line: "Artifact — Vehicle", power: "4", toughness: "3" }))).toBe(false);
  });

  it("reads the front face's power and toughness on a double-faced card", () => {
    const dfc = card({ type_line: "Legendary Artifact — Vehicle // Legendary Artifact — Vehicle", card_faces: [{ name: "A", power: "3", toughness: "3" }, { name: "B" }] as ScryfallCard["card_faces"] });
    expect(isLegalCommander(dfc)).toBe(true);
  });

  it("accepts a planeswalker that is a creature everywhere but the battlefield (Grist)", () => {
    const grist = card({ type_line: "Legendary Planeswalker — Grist", oracle_text: "As long as Grist isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types.\n+1: Create a 1/1 black and green Insect creature token." });
    expect(isLegalCommander(grist)).toBe(true);
    expect(isLegalCommander(card({ type_line: "Planeswalker — Jace", oracle_text: "As long as Jace isn't on the battlefield, it's a 1/1 creature." }))).toBe(false);
  });

  it("does not accept a Background on its own", () => {
    expect(isLegalCommander(card({ type_line: "Legendary Enchantment — Background" }))).toBe(false);
  });
});
