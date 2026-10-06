import type { ScryfallCard } from "./scryfall-types";

export function cardImageUrl(card: ScryfallCard, size: "small" | "normal" | "art_crop" = "normal"): string | undefined {
  if (card.image_uris?.[size]) return card.image_uris[size];
  return card.card_faces?.[0]?.image_uris?.[size];
}

// USD price for display, from Scryfall's daily price data. Falls back to the
// foil price (labelled) for cards that only exist as foils, and says so when
// there's no price at all rather than showing $0. Basic lands have no price in
// Scryfall's data and are effectively free, so they're labelled as such.
export function formatPrice(card: Pick<ScryfallCard, "prices" | "name" | "type_line">): string {
  const usd = card.prices?.usd;
  if (usd) return `$${parseFloat(usd).toFixed(2)}`;
  const foil = card.prices?.usd_foil ?? card.prices?.usd_etched;
  if (foil) return `$${parseFloat(foil).toFixed(2)} foil`;
  return isBasicLand(card) ? "Basic land" : "No price";
}

export function priceValue(card: Pick<ScryfallCard, "prices" | "name" | "type_line">): number | null {
  const raw = card.prices?.usd ?? card.prices?.usd_foil ?? card.prices?.usd_etched;
  const n = raw ? parseFloat(raw) : NaN;
  if (!Number.isNaN(n)) return n;
  return isBasicLand(card) ? 0 : null;
}

export function mostExpensive(entries: { card: ScryfallCard }[], limit = 5): { name: string; price: number }[] {
  return entries
    .map((e) => ({ name: e.card.name, price: priceValue(e.card) ?? 0 }))
    .filter((c) => c.price > 0)
    .sort((a, b) => b.price - a.price)
    .slice(0, limit);
}

export function cardOracleText(card: ScryfallCard): string {
  if (card.oracle_text) return card.oracle_text;
  if (card.card_faces?.length) {
    return card.card_faces.map((f) => `${f.name}: ${f.oracle_text ?? ""}`).join("\n//\n");
  }
  return "";
}

export function cardManaCost(card: ScryfallCard): string {
  if (card.mana_cost) return card.mana_cost;
  if (card.card_faces?.length) {
    return card.card_faces.map((f) => f.mana_cost).filter(Boolean).join(" // ");
  }
  return "";
}

export function isLegalCommander(card: ScryfallCard): boolean {
  const typeLine = card.type_line ?? "";
  const isLegendaryCreature = typeLine.includes("Legendary") && typeLine.includes("Creature");
  const explicitlyAllowed = /can be your commander/i.test(cardOracleText(card));
  return isLegendaryCreature || explicitlyAllowed;
}

export function isBackground(card: ScryfallCard): boolean {
  return (card.type_line ?? "").includes("Background");
}

export function canHavePartner(card: ScryfallCard): boolean {
  return /\bpartner\b/i.test(cardOracleText(card)) && !/partner with/i.test(cardOracleText(card));
}

export function partnerName(card: ScryfallCard): string | null {
  const match = cardOracleText(card).match(/Partner with ([^(\n]+)/i);
  return match ? match[1].trim() : null;
}

export function colorIdentityUnion(cards: ScryfallCard[]): string[] {
  const set = new Set<string>();
  for (const card of cards) for (const c of card.color_identity ?? []) set.add(c);
  const order = ["W", "U", "B", "R", "G"];
  return order.filter((c) => set.has(c));
}

export function isWithinColorIdentity(card: ScryfallCard, identity: string[]): boolean {
  const allowed = new Set(identity);
  return (card.color_identity ?? []).every((c) => allowed.has(c));
}

const BASIC_LAND_NAMES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes", "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp", "Snow-Covered Mountain", "Snow-Covered Forest"]);

export function isBasicLand(card: Pick<ScryfallCard, "name" | "type_line">): boolean {
  return BASIC_LAND_NAMES.has(card.name) || (card.type_line ?? "").includes("Basic Land");
}

export function commanderLegality(card: ScryfallCard): "legal" | "not_legal" | "restricted" | "banned" {
  return card.legalities?.commander ?? "not_legal";
}

// Creature subtypes after the em dash, e.g. "Legendary Creature — Angel
// Horror" -> ["Angel", "Horror"]. Empty for non-creatures.
export function creatureSubtypes(card: Pick<ScryfallCard, "type_line">): string[] {
  const typeLine = card.type_line ?? "";
  const front = typeLine.split("//")[0];
  if (!front.includes("Creature")) return [];
  const afterDash = front.split("—")[1];
  if (!afterDash) return [];
  return afterDash.trim().split(/\s+/).filter(Boolean);
}

const TYPE_CATEGORY_ORDER = [
  "Battle",
  "Planeswalker",
  "Creature",
  "Sorcery",
  "Instant",
  "Artifact",
  "Enchantment",
  "Land",
] as const;
export type TypeCategory = (typeof TYPE_CATEGORY_ORDER)[number] | "Other";

export function primaryTypeCategory(card: Pick<ScryfallCard, "type_line">): TypeCategory {
  const typeLine = card.type_line ?? "";
  // type_line for double-faced cards looks like "Creature // Land"; the
  // front face's type governs how we bucket it in the decklist.
  const front = typeLine.split("//")[0];
  for (const category of TYPE_CATEGORY_ORDER) {
    if (front.includes(category)) return category;
  }
  return "Other";
}

export function sortByCategoryThenName(cards: ScryfallCard[]): ScryfallCard[] {
  return [...cards].sort((a, b) => {
    const ai = TYPE_CATEGORY_ORDER.indexOf(primaryTypeCategory(a) as (typeof TYPE_CATEGORY_ORDER)[number]);
    const bi = TYPE_CATEGORY_ORDER.indexOf(primaryTypeCategory(b) as (typeof TYPE_CATEGORY_ORDER)[number]);
    const aOrder = ai === -1 ? TYPE_CATEGORY_ORDER.length : ai;
    const bOrder = bi === -1 ? TYPE_CATEGORY_ORDER.length : bi;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });
}
