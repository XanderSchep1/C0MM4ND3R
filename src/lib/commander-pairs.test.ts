import { describe, expect, it } from "vitest";
import { canPair, describeAbility, pairingAbilities, pairingGuide } from "./commander-pairs";
import type { ScryfallCard } from "./scryfall-types";

const card = (name: string, extra: Partial<ScryfallCard> = {}) => ({ id: name, name, type_line: "Legendary Creature — Human", keywords: [], color_identity: [], ...extra }) as unknown as ScryfallCard;

// Text and keywords as Scryfall prints them.
const tymna = card("Tymna the Weaver", { oracle_text: "Lifelink\nAt the beginning of your postcombat main phase...\nPartner (You can have two commanders if both have partner.)", keywords: ["Lifelink", "Partner"] });
const thrasios = card("Thrasios, Triton Hero", { oracle_text: "{4}: Scry 1, then reveal the top card of your library.\nPartner (You can have two commanders if both have partner.)", keywords: ["Partner"] });
const akroma = card("Akroma, Vision of Ixidor", { oracle_text: "Each other creature you control gets +1/+1 if it has flying, and so on for partner.\nPartner", keywords: ["Flying", "Partner"] });
const will = card("Will Kenrith", { oracle_text: "{1}{U}, {T}: Target player draws a card.\nPartner with Rowan Kenrith (When this creature enters, target player may put Rowan Kenrith into their hand from their library, then shuffle.)", keywords: ["Partner with", "Partner"] });
const rowan = card("Rowan Kenrith", { oracle_text: "{2}{R}, {T}: Target creature gains haste.\nPartner with Will Kenrith (When this creature enters, target player may put Will Kenrith into their hand from their library, then shuffle.)", keywords: ["Partner with", "Partner"] });
const bjorna = card("Bjorna, Nightfall Alchemist", { oracle_text: "Goad...\nPartner—Friends forever (You can have two commanders if both have this ability.)", keywords: ["Goad", "Partner"] });
const dungeonMaster = card("Dungeon Master", { oracle_text: "Partner—Friends forever (You can have two commanders if both have this ability.)", keywords: ["Partner"] });
const abby = card("Abby, Merciless Soldier", { oracle_text: "Menace\nPartner—Survivors (You can have two commanders if both have this ability.)", keywords: ["Partner"] });
const atreus = card("Atreus, Impulsive Son", { oracle_text: "Reach\nPartner—Father & son (You can have two commanders if both have this ability.)", keywords: ["Reach", "Partner"] });
const alora = card("Alora, Merry Thief", { oracle_text: "Whenever you attack...\nChoose a Background (You can have a Background as a second commander.)", keywords: ["Choose a background"] });
const alora2 = card("Abdel Adrian, Gorion's Ward", { oracle_text: "When Abdel Adrian enters...\nChoose a Background", keywords: ["Choose a background"] });
const acolyte = card("Acolyte of Bahamut", { type_line: "Legendary Enchantment — Background", oracle_text: 'Commander creatures you own have "The first Dragon spell you cast each turn costs {2} less to cast."' });
const criminal = card("Criminal Past", { type_line: "Legendary Enchantment — Background", oracle_text: 'Commander creatures you own have "When this creature enters, mill three cards."' });
const facelessOne = card("Faceless One", { type_line: "Legendary Enchantment Creature — Background", oracle_text: "Commander creatures you own have..." });
const ace = card("Ace, Fearless Rebel", { oracle_text: "Nitro-9 — Whenever Ace attacks...\nDoctor's companion (You can have two commanders if the other is a Doctor.)", keywords: ["Doctor's companion"] });
const doctor = card("The Eighth Doctor", { type_line: "Legendary Creature — Time Lord Doctor", oracle_text: "When The Eighth Doctor enters, mill three cards." });
const doctor2 = card("The Eleventh Doctor", { type_line: "Legendary Creature — Time Lord Doctor", oracle_text: "I. AM. TALKING!..." });
const amy = card("Amy Pond", { oracle_text: "Partner with Rory Williams (When this creature enters, target player may put Rory Williams into their hand.)\nWhenever Amy Pond...\nDoctor's companion", keywords: ["Partner with", "Partner", "Doctor's companion"] });
const rory = card("Rory Williams", { oracle_text: "Partner with Amy Pond (When this creature enters...)\nDoctor's companion", keywords: ["Partner with", "Partner", "Doctor's companion"] });
const atraxa = card("Atraxa, Praetors' Voice", { oracle_text: "Flying, vigilance, deathtouch, lifelink", keywords: ["Flying"] });

const kinds = (c: ScryfallCard) => pairingAbilities(c).map((a) => a.kind);

describe("pairingAbilities", () => {
  it("tells the kinds apart", () => {
    expect(kinds(tymna)).toEqual(["partner"]);
    expect(kinds(akroma)).toEqual(["partner"]); // Partner on a line of its own, below text that mentions it
    expect(kinds(will)).toEqual(["partner-with"]); // not also plain Partner, though its keywords say so
    expect(kinds(bjorna)).toEqual(["partner-variant"]);
    expect(kinds(alora)).toEqual(["choose-a-background"]);
    expect(kinds(acolyte)).toEqual(["background"]);
    expect(kinds(ace)).toEqual(["doctors-companion"]);
    expect(kinds(doctor)).toEqual(["time-lord-doctor"]);
    expect(kinds(atraxa)).toEqual([]);
  });

  it("reads the name after 'Partner with' and the variant after 'Partner—'", () => {
    expect(pairingAbilities(will)).toEqual([{ kind: "partner-with", name: "Rowan Kenrith" }]);
    expect(pairingAbilities(abby)).toEqual([{ kind: "partner-variant", label: "Survivors" }]);
    expect(pairingAbilities(atreus)).toEqual([{ kind: "partner-variant", label: "Father & son" }]);
  });

  it("finds several at once (a Doctor's companion with Partner with, a creature that is also a Background)", () => {
    expect(kinds(amy).sort()).toEqual(["doctors-companion", "partner-with"]);
    expect(kinds(facelessOne)).toEqual(["background"]);
  });

  it("reads each face of a double-faced card", () => {
    const dfc = card("Front // Back", { oracle_text: undefined, card_faces: [{ name: "Front", oracle_text: "Flying" }, { name: "Back", oracle_text: "Partner (You can have two commanders if both have partner.)" }] as ScryfallCard["card_faces"] });
    expect(kinds(dfc)).toEqual(["partner"]);
  });

  it("describes them as printed", () => {
    expect(pairingAbilities(will).map(describeAbility)).toEqual(["Partner with Rowan Kenrith"]);
    expect(pairingAbilities(bjorna).map(describeAbility)).toEqual(["Partner—Friends forever"]);
  });
});

describe("canPair", () => {
  it("lets two plain Partners share the command zone, whichever way round", () => {
    expect(canPair(tymna, thrasios)).toEqual({ ok: true, via: "Partner" });
    expect(canPair(thrasios, akroma).ok).toBe(true);
  });

  it("lets 'Partner with' cards pair only with the card they name", () => {
    expect(canPair(will, rowan)).toMatchObject({ ok: true, via: "Partner with Rowan Kenrith" });
    expect(canPair(rowan, will).ok).toBe(true);
    expect(canPair(will, tymna).ok).toBe(false);
    expect(canPair(tymna, will).ok).toBe(false);
    expect(canPair(will, rory).ok).toBe(false);
  });

  it("treats a double-faced card's front name as its name", () => {
    const kydele = card("Kydele, Chosen of Kruphix // Thrasios", { oracle_text: "Partner with Thrasios, Triton Hero (...)", keywords: ["Partner with"] });
    const thrasiosCard = card("Thrasios, Triton Hero", { oracle_text: "Partner with Kydele, Chosen of Kruphix (...)", keywords: ["Partner with"] });
    expect(canPair(kydele, thrasiosCard).ok).toBe(true);
  });

  it("lets Partner variants pair only with the same variant", () => {
    expect(canPair(bjorna, dungeonMaster).ok).toBe(true);
    expect(canPair(bjorna, abby).ok).toBe(false);
    expect(canPair(abby, atreus).ok).toBe(false);
    expect(canPair(bjorna, tymna).ok).toBe(false);
  });

  it("pairs Choose a Background with a Background, in either order, and nothing else", () => {
    expect(canPair(alora, acolyte)).toMatchObject({ ok: true, via: "Choose a Background" });
    expect(canPair(acolyte, alora).ok).toBe(true);
    expect(canPair(alora, facelessOne).ok).toBe(true); // a creature Background is still a Background
    expect(canPair(alora, alora2).ok).toBe(false);
    expect(canPair(acolyte, criminal).ok).toBe(false);
    expect(canPair(alora, tymna).ok).toBe(false);
  });

  it("pairs a Doctor's companion with a Time Lord Doctor, in either order, and nothing else", () => {
    expect(canPair(ace, doctor)).toMatchObject({ ok: true, via: "Doctor's companion" });
    expect(canPair(doctor, ace).ok).toBe(true);
    expect(canPair(doctor, doctor2).ok).toBe(false);
    expect(canPair(ace, tymna).ok).toBe(false);
  });

  it("uses whichever shared ability works (Amy Pond is Rory's partner and any Doctor's companion)", () => {
    expect(canPair(amy, rory).ok).toBe(true);
    expect(canPair(amy, doctor).ok).toBe(true);
    expect(canPair(amy, tymna).ok).toBe(false);
  });

  it("explains a refusal, and says whether either card has a pairing ability at all", () => {
    const refused = canPair(will, tymna);
    expect(refused).toMatchObject({ ok: false, known: true });
    if (!refused.ok) expect(refused.reason).toContain("Will Kenrith (Partner with Rowan Kenrith) pairs with Rowan Kenrith");
    expect(canPair(atraxa, card("Kenrith"))).toMatchObject({ ok: false, known: false });
  });
});

describe("pairingGuide", () => {
  it("says what the second slot is for", () => {
    expect(pairingGuide(tymna)).toMatchObject({ label: "Add partner" });
    expect(pairingGuide(will)).toMatchObject({ label: "Add Rowan Kenrith", clause: '!"Rowan Kenrith"' });
    expect(pairingGuide(bjorna)).toMatchObject({ label: "Add Friends forever partner", clause: 'o:"Partner—Friends forever"' });
    expect(pairingGuide(alora)).toMatchObject({ label: "Choose a Background", clause: "t:background" });
    expect(pairingGuide(acolyte)).toMatchObject({ clause: 'keyword:"choose a background"' });
    expect(pairingGuide(ace)).toMatchObject({ clause: 't:"time lord doctor"' });
    expect(pairingGuide(doctor)).toMatchObject({ clause: `keyword:"doctor's companion"` });
  });

  it("excludes Partner-with and variant cards from the plain-Partner search", () => {
    expect(pairingGuide(tymna)!.clause).toBe('(keyword:partner -keyword:"partner with" -o:"Partner—")');
  });

  it("combines the options of a card with several abilities", () => {
    expect(pairingGuide(amy)).toMatchObject({ label: "Add second commander", clause: '(!"Rory Williams" or t:"time lord doctor")' });
  });

  it("has nothing to offer a commander with no pairing ability", () => {
    expect(pairingGuide(atraxa)).toBeNull();
  });

  it("can't be broken out of by a card name with a quote in it", () => {
    const odd = card("Odd", { oracle_text: 'Partner with Bad "Name" (...)', keywords: ["Partner with"] });
    expect(pairingGuide(odd)!.clause).toBe('!"Bad Name"');
  });
});
