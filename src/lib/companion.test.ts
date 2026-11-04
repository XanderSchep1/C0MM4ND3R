import { describe, expect, it } from "vitest";
import type { DeckCardEntry } from "./commander";
import { companionCondition, companionIssues, isCompanion } from "./companion";
import type { ScryfallCard } from "./scryfall-types";

const card = (name: string, extra: Partial<ScryfallCard> = {}) => ({ id: name, name, type_line: "Artifact", cmc: 1, keywords: [], color_identity: [], ...extra }) as unknown as ScryfallCard;
const entry = (c: ScryfallCard, quantity = 1): DeckCardEntry => ({ card: c, quantity });
const companionCard = (name: string, rule: string) => card(name, { type_line: "Legendary Creature — Human", keywords: ["Companion"], oracle_text: `Companion — ${rule} (If this card is your chosen companion, you may put it into your hand from outside the game for {3} any time you could cast a sorcery.)` });

const lurrus = companionCard("Lurrus of the Dream-Den", "Each permanent card in your starting deck has mana value 2 or less.");
const gyruda = companionCard("Gyruda, Doom of Depths", "Your starting deck contains only cards with even mana values.");
const obosh = companionCard("Obosh, the Preypiercer", "Your starting deck contains only cards with odd mana values and land cards.");
const keruga = companionCard("Keruga, the Macrosage", "Your starting deck contains only cards with mana value 3 or greater and land cards.");
const lutri = companionCard("Lutri, the Spellchaser", "Each nonland card in your starting deck has a different name.");
const umori = companionCard("Umori, the Collector", "Each nonland card in your starting deck shares a card type.");
const jegantha = companionCard("Jegantha, the Wellspring", "No card in your starting deck has more than one of the same mana symbol in its mana cost.");
const kaheera = companionCard("Kaheera, the Orphanguard", "Each creature card in your starting deck is a Cat, Elemental, Nightmare, Dinosaur, or Beast card.");
const zirda = companionCard("Zirda, the Dawnwaker", "Each permanent card in your starting deck has an activated ability.");
const yorion = companionCard("Yorion, Sky Nomad", "Your starting deck contains at least twenty cards more than the minimum deck size.");

const land = (name = "Forest") => card(name, { type_line: "Basic Land — Forest", cmc: 0 });
const spell = (name: string, cmc: number, type_line = "Sorcery", extra: Partial<ScryfallCard> = {}) => card(name, { type_line, cmc, ...extra });

describe("companionCondition / isCompanion", () => {
  it("reads the rule after 'Companion —' without the reminder text", () => {
    expect(companionCondition(lurrus)).toBe("Each permanent card in your starting deck has mana value 2 or less.");
    expect(companionCondition(card("Plain"))).toBeNull();
  });

  it("knows a companion by its keyword", () => {
    expect(isCompanion(lurrus)).toBe(true);
    expect(isCompanion(card("Plain"))).toBe(false);
  });
});

describe("companionIssues", () => {
  it("is quiet when the deck meets the rule", () => {
    expect(companionIssues(lurrus, [entry(spell("Sol Ring", 1, "Artifact")), entry(spell("Cultivate", 3, "Sorcery")), entry(land())])).toEqual([]);
  });

  it("Lurrus: permanents cost two or less (spells may cost more)", () => {
    const issues = companionIssues(lurrus, [entry(spell("Wurmcoil Engine", 6, "Artifact Creature — Phyrexian Wurm")), entry(spell("Cultivate", 3, "Sorcery"))]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Wurmcoil Engine");
    expect(issues[0]).not.toContain("Cultivate");
    expect(issues[0]).toContain("Each permanent card in your starting deck has mana value 2 or less.");
  });

  it("Gyruda and Obosh: even or odd mana values (lands count as even, and are fine for Obosh)", () => {
    expect(companionIssues(gyruda, [entry(spell("Two", 2)), entry(spell("Three", 3)), entry(land())])[0]).toContain("Three");
    expect(companionIssues(gyruda, [entry(spell("Two", 2)), entry(land())])).toEqual([]);
    expect(companionIssues(obosh, [entry(spell("Three", 3)), entry(spell("Two", 2)), entry(land())])[0]).toContain("Two");
    expect(companionIssues(obosh, [entry(spell("Three", 3)), entry(land())])).toEqual([]);
  });

  it("Keruga: mana value 3 or more, or a land", () => {
    expect(companionIssues(keruga, [entry(spell("Sol Ring", 1, "Artifact")), entry(spell("Big", 5)), entry(land())])[0]).toContain("Sol Ring");
    expect(companionIssues(keruga, [entry(spell("Big", 5)), entry(land())])).toEqual([]);
  });

  it("Lutri: nonland cards have different names", () => {
    expect(companionIssues(lutri, [entry(spell("Relentless Rats", 2, "Creature — Rat"), 4), entry(land(), 30)])[0]).toContain("Relentless Rats");
    expect(companionIssues(lutri, [entry(spell("A", 2)), entry(spell("B", 2)), entry(land(), 30)])).toEqual([]);
  });

  it("Umori: every nonland card shares a type; names the cards outside the most common one", () => {
    const issues = companionIssues(umori, [entry(spell("A", 2, "Creature — Elf")), entry(spell("B", 2, "Artifact Creature — Golem")), entry(spell("C", 2, "Sorcery")), entry(land())]);
    expect(issues[0]).toContain("C");
    expect(companionIssues(umori, [entry(spell("A", 2, "Creature — Elf")), entry(spell("B", 2, "Artifact Creature — Golem")), entry(land())])).toEqual([]);
  });

  it("Jegantha: no repeated mana symbol in any cost", () => {
    expect(companionIssues(jegantha, [entry(spell("Counterspell", 2, "Instant", { mana_cost: "{U}{U}" })), entry(spell("Sol Ring", 1, "Artifact", { mana_cost: "{1}" }))])[0]).toContain("Counterspell");
    expect(companionIssues(jegantha, [entry(spell("Cultivate", 3, "Sorcery", { mana_cost: "{2}{G}" })), entry(spell("Rakdos", 2, "Instant", { mana_cost: "{B}{R}" }))])).toEqual([]);
  });

  it("Kaheera: creatures must be Cat, Elemental, Nightmare, Dinosaur or Beast (changelings count as all)", () => {
    expect(companionIssues(kaheera, [entry(spell("Llanowar Elves", 1, "Creature — Elf Druid")), entry(spell("Cat", 2, "Creature — Cat")), entry(spell("Sol Ring", 1, "Artifact"))])[0]).toContain("Llanowar Elves");
    expect(companionIssues(kaheera, [entry(spell("Mirror Entity", 3, "Creature — Shapeshifter", { keywords: ["Changeling"] })), entry(spell("Cat", 2, "Creature — Cat"))])).toEqual([]);
  });

  it("Yorion can never be met by a 100-card deck", () => {
    expect(companionIssues(yorion, [entry(land(), 99)])[0]).toContain("twenty cards over the minimum");
  });

  it("has no automatic check for Zirda or a companion it doesn't know", () => {
    expect(companionIssues(zirda, [entry(spell("Anything", 9))])).toEqual([]);
    expect(companionIssues(companionCard("Newcomer", "Some new rule."), [entry(spell("Anything", 9))])).toEqual([]);
  });

  it("judges a double-faced card by its front face, and doesn't count the companion itself", () => {
    const mdfc = spell("Spell // Land", 4, "Sorcery // Land");
    expect(companionIssues(keruga, [entry(mdfc)])).toEqual([]);
    expect(companionIssues(gyruda, [entry(gyruda), entry(spell("Two", 2))])).toEqual([]);
  });

  it("lists at most three offenders by name", () => {
    const message = companionIssues(gyruda, ["A", "B", "C", "D", "E"].map((n) => entry(spell(n, 3))))[0];
    expect(message).toContain("A, B, C and 2 more");
  });
});
