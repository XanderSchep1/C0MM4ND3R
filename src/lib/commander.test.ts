import { describe, expect, it } from "vitest";
import { validateCommanderDeck, type DeckCardEntry } from "./commander";
import type { ScryfallCard } from "./scryfall-types";

const card = (name: string, extra: Partial<ScryfallCard> = {}) =>
  ({ id: name, name, type_line: "Legendary Creature — Human", keywords: [], color_identity: [], cmc: 2, legalities: { commander: "legal" }, ...extra }) as unknown as ScryfallCard;
const entry = (c: ScryfallCard, quantity = 1): DeckCardEntry => ({ card: c, quantity });

const tymna = card("Tymna the Weaver", { oracle_text: "Partner (You can have two commanders if both have partner.)", keywords: ["Partner"], color_identity: ["W", "B"] });
const thrasios = card("Thrasios, Triton Hero", { oracle_text: "Partner (You can have two commanders if both have partner.)", keywords: ["Partner"], color_identity: ["G", "U"] });
const will = card("Will Kenrith", { oracle_text: "Partner with Rowan Kenrith (...)", keywords: ["Partner with", "Partner"], color_identity: ["U"] });
const alora = card("Alora, Merry Thief", { oracle_text: "Choose a Background", keywords: ["Choose a background"], color_identity: ["U"] });
const background = card("Acolyte of Bahamut", { type_line: "Legendary Enchantment — Background", color_identity: ["G"] });
const atraxa = card("Atraxa", { color_identity: ["W", "U", "B", "G"] });
const lurrus = card("Lurrus of the Dream-Den", {
  keywords: ["Companion"],
  color_identity: ["W", "B"],
  oracle_text: "Companion — Each permanent card in your starting deck has mana value 2 or less. (...)",
});
const messages = (r: ReturnType<typeof validateCommanderDeck>, severity?: "error" | "warning") => r.issues.filter((i) => !severity || i.severity === severity).map((i) => i.message);

describe("validateCommanderDeck: commanders", () => {
  it("accepts two commanders that can pair, with their colours combined", () => {
    const result = validateCommanderDeck([entry(tymna), entry(thrasios)], []);
    expect(messages(result).some((m) => /commanders together|legal commander pair/.test(m))).toBe(false);
    expect(result.colorIdentity).toEqual(["W", "U", "B", "G"]);
  });

  it("accepts a Background with a commander that can choose one", () => {
    expect(messages(validateCommanderDeck([entry(alora), entry(background)], [])).some((m) => /together/.test(m))).toBe(false);
  });

  it("refuses two commanders that can't pair, saying why", () => {
    const result = validateCommanderDeck([entry(will), entry(tymna)], []);
    const [issue] = messages(result, "error").filter((m) => /together/.test(m));
    expect(issue).toContain("Will Kenrith and Tymna the Weaver can't be commanders together");
    expect(issue).toContain("Rowan Kenrith");
  });

  it("only warns when neither commander has any pairing ability we know of", () => {
    const result = validateCommanderDeck([entry(atraxa), entry(card("Kenrith"))], []);
    expect(messages(result, "error").some((m) => /together|pair/.test(m))).toBe(false);
    expect(messages(result, "warning").some((m) => /may not be a legal commander pair/.test(m))).toBe(true);
  });

  it("explains a Background chosen on its own", () => {
    const [issue] = messages(validateCommanderDeck([entry(background)], []), "error");
    expect(issue).toContain("Acolyte of Bahamut is a Background");
  });

  it("allows a Background that is also a creature on its own, and a lone Partner", () => {
    const faceless = card("Faceless One", { type_line: "Legendary Enchantment Creature — Background" });
    expect(messages(validateCommanderDeck([entry(faceless)], []), "error").some((m) => /can't be a commander|Background/.test(m))).toBe(false);
    expect(messages(validateCommanderDeck([entry(tymna)], []), "error").some((m) => /commander/.test(m) && !/100/.test(m))).toBe(false);
  });

  it("caps the command zone at two", () => {
    expect(messages(validateCommanderDeck([entry(tymna), entry(thrasios), entry(atraxa)], []), "error").some((m) => /at most two commanders/.test(m))).toBe(true);
  });
});

describe("validateCommanderDeck: companion", () => {
  const cards = (n: number) => Array.from({ length: n }, (_, i) => entry(card(`Filler ${i}`, { type_line: "Land", cmc: 0, color_identity: [] })));

  it("sits outside the 100 cards", () => {
    const result = validateCommanderDeck([entry(atraxa)], cards(99), [entry(lurrus)]);
    expect(result.totalCards).toBe(100);
    expect(result.companionCount).toBe(1);
    expect(messages(result, "error").some((m) => /exactly 100/.test(m))).toBe(false);
  });

  it("has to fit the commander's colours", () => {
    const result = validateCommanderDeck([entry(card("Mono Red", { color_identity: ["R"] }))], cards(99), [entry(lurrus)]);
    expect(messages(result, "error").some((m) => /companion Lurrus of the Dream-Den \(WB\) is outside your commander's color identity \(R\)/.test(m))).toBe(true);
  });

  it("must be a companion, legal, and only one", () => {
    expect(messages(validateCommanderDeck([entry(atraxa)], cards(99), [entry(card("Not One"))]), "error")).toContain("Not One isn't a companion.");
    const banned = card("Banned One", { keywords: ["Companion"], legalities: { commander: "banned" } } as Partial<ScryfallCard>);
    expect(messages(validateCommanderDeck([entry(atraxa)], cards(99), [entry(banned)]), "error").some((m) => /banned in Commander/.test(m))).toBe(true);
    expect(messages(validateCommanderDeck([entry(atraxa)], cards(99), [entry(lurrus), entry(card("Second", { keywords: ["Companion"] }))]), "error")).toContain("A deck can have only one companion.");
  });

  it("warns, rather than errors, when the deck breaks its rule, counting the commander as part of the deck", () => {
    const expensive = card("Expensive Commander", { color_identity: ["W", "B"], cmc: 6 });
    const result = validateCommanderDeck([entry(expensive)], cards(99), [entry(lurrus)]);
    const warning = messages(result, "warning").find((m) => /Lurrus/.test(m));
    expect(warning).toContain("Expensive Commander");
    expect(messages(result, "error").some((m) => /Lurrus/.test(m))).toBe(false);
  });

  it("changes nothing for a deck without one", () => {
    const result = validateCommanderDeck([entry(atraxa)], cards(99));
    expect(result.companionCount).toBe(0);
    expect(result.issues).toEqual([]);
  });
});
