import type { ScryfallCard } from "./scryfall-types";
import { isBackground } from "./card-helpers";

// Who may share the command zone. A commander can have a second one if both have the same kind of pairing
// ability, or if one asks for a Background / Doctor and the other is one:
//   Partner                      another card with plain Partner
//   Partner with <name>          exactly that card (which names this one back)
//   Partner—<variant>            another card with the same variant (Friends forever, Survivors, ...)
//   Choose a Background          a Background
//   Doctor's companion           a Time Lord Doctor (and the other way round)
// A card can have more than one (Amy Pond is Partner with Rory Williams and a Doctor's companion).

export type PairingAbility =
  | { kind: "partner" }
  | { kind: "partner-with"; name: string }
  | { kind: "partner-variant"; label: string }
  | { kind: "choose-a-background" }
  | { kind: "background" }
  | { kind: "doctors-companion" }
  | { kind: "time-lord-doctor" };

// Raw rules text, one entry per line, from every face (cardOracleText prefixes face names, which would hide a
// line start).
function oracleLines(card: ScryfallCard): string[] {
  const texts = card.oracle_text ? [card.oracle_text] : (card.card_faces ?? []).map((f) => f.oracle_text ?? "");
  return texts.flatMap((t) => t.split("\n")).map((l) => l.trim());
}

const FRONT = (name: string) => name.split(" // ")[0].trim();

export function pairingAbilities(card: ScryfallCard): PairingAbility[] {
  const lines = oracleLines(card);
  const keywords = card.keywords ?? [];
  const abilities: PairingAbility[] = [];

  let partnerKinds = 0;
  for (const line of lines) {
    const withName = line.match(/^Partner with ([^(]+?)\s*(?:\(|$)/i);
    if (withName) {
      abilities.push({ kind: "partner-with", name: withName[1].trim() });
      partnerKinds++;
      continue;
    }
    const variant = line.match(/^Partner\s*—\s*([^(]+?)\s*(?:\(|$)/i);
    if (variant) {
      abilities.push({ kind: "partner-variant", label: variant[1].trim() });
      partnerKinds++;
    }
  }
  if (partnerKinds === 0 && (lines.some((l) => /^Partner\s*(?:\(.*)?$/i.test(l)) || keywords.includes("Partner"))) {
    abilities.push({ kind: "partner" });
  }

  if (keywords.includes("Choose a background") || lines.some((l) => /^Choose a Background\b/i.test(l))) abilities.push({ kind: "choose-a-background" });
  if (isBackground(card)) abilities.push({ kind: "background" });
  if (keywords.includes("Doctor's companion") || lines.some((l) => /^Doctor's companion\b/i.test(l))) abilities.push({ kind: "doctors-companion" });
  if ((card.type_line ?? "").includes("Time Lord Doctor")) abilities.push({ kind: "time-lord-doctor" });
  return abilities;
}

// "Partner with Rowan Kenrith", "Choose a Background", ...
export function describeAbility(ability: PairingAbility): string {
  switch (ability.kind) {
    case "partner":
      return "Partner";
    case "partner-with":
      return `Partner with ${ability.name}`;
    case "partner-variant":
      return `Partner—${ability.label}`;
    case "choose-a-background":
      return "Choose a Background";
    case "background":
      return "Background";
    case "doctors-companion":
      return "Doctor's companion";
    case "time-lord-doctor":
      return "Time Lord Doctor";
  }
}

// What a card looks for in its partner, as a phrase: "…pairs with <this>".
function needs(ability: PairingAbility): string {
  switch (ability.kind) {
    case "partner":
      return "another card with Partner";
    case "partner-with":
      return ability.name;
    case "partner-variant":
      return `another Partner—${ability.label} card`;
    case "choose-a-background":
      return "a Background";
    case "background":
      return "a commander with Choose a Background";
    case "doctors-companion":
      return "a Time Lord Doctor";
    case "time-lord-doctor":
      return "a Doctor's companion";
  }
}

const sameName = (card: ScryfallCard, name: string) => card.name === name || FRONT(card.name) === FRONT(name);

// Whether `a` and `b` can be the two commanders of one deck, through some ability they have in common.
export type PairResult = { ok: true; via: string } | { ok: false; reason: string; known: boolean };

// How `x` (an ability of card `a`) lets `a` pair with `b` through `y` (an ability of `b`), or null. Not symmetric
// by itself: canPair tries both ways round.
function pairedBy(a: ScryfallCard, x: PairingAbility, b: ScryfallCard, y: PairingAbility): string | null {
  if (x.kind === "partner" && y.kind === "partner") return "Partner";
  if (x.kind === "partner-with" && y.kind === "partner-with" && sameName(b, x.name) && sameName(a, y.name)) return describeAbility(x);
  if (x.kind === "partner-variant" && y.kind === "partner-variant" && x.label.toLowerCase() === y.label.toLowerCase()) return describeAbility(x);
  if (x.kind === "choose-a-background" && y.kind === "background") return "Choose a Background";
  if (x.kind === "doctors-companion" && y.kind === "time-lord-doctor") return "Doctor's companion";
  return null;
}

export function canPair(a: ScryfallCard, b: ScryfallCard): PairResult {
  const abilitiesA = pairingAbilities(a);
  const abilitiesB = pairingAbilities(b);

  for (const x of abilitiesA) {
    for (const y of abilitiesB) {
      const via = pairedBy(a, x, b, y) ?? pairedBy(b, y, a, x);
      if (via) return { ok: true, via };
    }
  }

  const known = abilitiesA.length > 0 || abilitiesB.length > 0;
  const wants = (card: ScryfallCard, abilities: PairingAbility[]) =>
    abilities.length === 0 ? `${card.name} has no way to pair with another commander` : `${card.name} (${abilities.map(describeAbility).join(", ")}) pairs with ${abilities.map(needs).join(" or ")}`;
  return { ok: false, known, reason: `${wants(a, abilitiesA)}; ${wants(b, abilitiesB)}.` };
}

// One thing the second commander can be, given the first: what to call it, how to search for it, what fits.
export interface PairingGuide {
  // Which of the first commander's abilities this answers; also what the search route is told ("via").
  kind: PairingAbility["kind"];
  // How the choice is named when offering it: "Partner", "Background", ...
  option: string;
  // The search box's placeholder: "Search for a partner…".
  search: string;
  // A Scryfall query clause that finds the candidates (they're checked again with canPair afterwards).
  clause: string;
  // One line saying what fits.
  hint: string;
}

const quote = (text: string) => `"${text.replace(/"/g, "")}"`;

function guideFor(ability: PairingAbility): PairingGuide {
  const kind = ability.kind;
  switch (ability.kind) {
    case "partner":
      return { kind, option: "Partner", search: "Search for a partner…", clause: `(keyword:partner -keyword:"partner with" -o:"Partner—")`, hint: "Any other commander with plain Partner." };
    case "partner-with":
      return { kind, option: `${ability.name} (Partner with)`, search: `Search for ${ability.name}…`, clause: `!${quote(FRONT(ability.name))}`, hint: `${ability.name} is the only partner this card can have.` };
    case "partner-variant":
      return { kind, option: `Partner—${ability.label}`, search: `Search for a Partner—${ability.label} commander…`, clause: `o:${quote(`Partner—${ability.label}`)}`, hint: `Another commander with Partner—${ability.label}.` };
    case "choose-a-background":
      return { kind, option: "Background", search: "Search for a Background…", clause: "t:background", hint: "A Background as the second commander." };
    case "background":
      return { kind, option: "Commander with Choose a Background", search: "Search for a commander that can choose a Background…", clause: `keyword:${quote("choose a background")}`, hint: "A Background needs a commander with Choose a Background." };
    case "doctors-companion":
      return { kind, option: "Time Lord Doctor", search: "Search for a Time Lord Doctor…", clause: `t:${quote("time lord doctor")}`, hint: "A Doctor's companion pairs with a Time Lord Doctor." };
    case "time-lord-doctor":
      return { kind, option: "Doctor's companion", search: "Search for a Doctor's companion…", clause: `keyword:${quote("doctor's companion")}`, hint: "A Time Lord Doctor pairs with a Doctor's companion." };
  }
}

// What the first commander can be paired with, one entry per ability (none for a card with no way to pair).
export function pairingGuides(first: ScryfallCard): PairingGuide[] {
  return pairingAbilities(first).map(guideFor);
}

// The query clause for the second commander: restricted to one kind (`via`, a guide's kind) or, without one, to
// anything the first commander can pair with. null when there is nothing to restrict by.
export function pairingClause(first: ScryfallCard, via?: string | null): string | null {
  const all = pairingGuides(first);
  const chosen = via ? all.filter((g) => g.kind === via) : all;
  if (chosen.length === 0) return null;
  return chosen.length === 1 ? chosen[0].clause : `(${chosen.map((g) => g.clause).join(" or ")})`;
}
