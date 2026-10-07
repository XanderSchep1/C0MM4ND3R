import type { ScryfallCard } from "./scryfall-types";
import { isBasicLand, priceValue, primaryTypeCategory } from "./card-helpers";
import { THEMES } from "./deck-analysis";
import { searchAndCacheCards } from "./cards";
import { baseClause } from "./suggestions";

// Finds, for every card in a deck, popular cards that do the same job for less money
// ("cheaper") or for more ("pricier" — usually the better, more played version).
//
// "Same job" is judged the way the rest of the app judges roles: each card is tested against
// the deck-analysis themes (ramp, removal, card draw, …), and lands against other nonbasic
// lands. Candidates come from the popularity-ranked Scryfall results for that role, and have to
// be the same kind of card (an artifact for an artifact, an instant for an instant) at a similar
// mana cost. Cards with no clear role, like a pet-theme card, are left alone and counted.

export type ReplacementMode = "cheaper" | "pricier";

export interface ReplacementOption {
  card: ScryfallCard;
  // Candidate price minus current price: negative = saves money, positive = costs more.
  priceDiff: number;
}

export interface ReplacementRow {
  current: ScryfallCard;
  quantity: number;
  role: string;
  options: ReplacementOption[];
}

export interface ReplacementResult {
  rows: ReplacementRow[];
  // Nonbasic cards looked at, and how many of them had a role to compare within.
  checked: number;
  withRole: number;
}

interface Entry {
  card: ScryfallCard;
  quantity: number;
}

export const OPTIONS_PER_CARD = 3;
export const MAX_ROWS = 40;
const MAX_CMC_GAP = 1;
// Only bother replacing a card that costs real money, and only when the saving is meaningful.
const CHEAPER_MIN_CURRENT_PRICE = 2;
const CHEAPER_MIN_SAVING = 1;
const CHEAPER_MIN_SAVING_FRACTION = 0.3;
const PRICIER_MIN_EXTRA = 2;
const LAND_ROLE = { key: "land", label: "Land" };
const COLORS = ["W", "U", "B", "R", "G"];

const isLand = (c: ScryfallCard) => primaryTypeCategory(c) === "Land";
// EDHREC rank: lower = more played. Unranked sorts last.
const rank = (c: ScryfallCard) => c.edhrec_rank ?? Number.MAX_SAFE_INTEGER;

interface Role {
  key: string;
  label: string;
  clause: string;
}

function rolesOf(card: ScryfallCard): Role[] {
  if (isLand(card)) return isBasicLand(card) ? [] : [{ ...LAND_ROLE, clause: "t:land -is:basic" }];
  return THEMES.filter((t) => t.test(card)).map((t) => ({ key: t.key, label: t.label, clause: t.scryfallClause }));
}

// A replacement land has to make every colour the current one does.
function landCoversColors(candidate: ScryfallCard, current: ScryfallCard): boolean {
  const needed = (current.produced_mana ?? []).filter((m) => COLORS.includes(m));
  const has = new Set(candidate.produced_mana ?? []);
  return needed.every((m) => has.has(m));
}

function isSimilar(candidate: ScryfallCard, current: ScryfallCard): boolean {
  if (isLand(current)) return isLand(candidate) && landCoversColors(candidate, current);
  return primaryTypeCategory(candidate) === primaryTypeCategory(current) && Math.abs(candidate.cmc - current.cmc) <= MAX_CMC_GAP;
}

function qualifies(candidate: ScryfallCard, current: ScryfallCard, currentPrice: number, mode: ReplacementMode): number | null {
  const price = priceValue(candidate);
  if (price === null) return null;
  const diff = price - currentPrice;
  if (mode === "cheaper") {
    const needed = Math.max(CHEAPER_MIN_SAVING, CHEAPER_MIN_SAVING_FRACTION * currentPrice);
    return -diff >= needed ? diff : null;
  }
  // Pricier: it has to be more played than what it replaces, otherwise "expensive" just means rare.
  if (diff < PRICIER_MIN_EXTRA) return null;
  if (candidate.edhrec_rank === undefined) return null;
  return candidate.edhrec_rank < rank(current) ? diff : null;
}

export async function findReplacements(params: {
  commanders: Entry[];
  mainboard: Entry[];
  maybeboard: Entry[];
  colorIdentity: string[];
  mode: ReplacementMode;
}): Promise<ReplacementResult> {
  const { mode, colorIdentity } = params;
  const taken = new Set([...params.commanders, ...params.mainboard, ...params.maybeboard].map((e) => e.card.name.toLowerCase()));

  const considered = params.mainboard.filter((e) => !isBasicLand(e.card));
  const candidatesFor = considered
    .map((entry) => ({ entry, price: priceValue(entry.card), roles: rolesOf(entry.card) }))
    .filter((c) => c.roles.length > 0 && c.price !== null && (mode === "pricier" || (c.price as number) >= CHEAPER_MIN_CURRENT_PRICE));
  const withRole = considered.filter((e) => rolesOf(e.card).length > 0).length;

  // One search per role in play (cached for a day), so the whole deck costs a handful of queries.
  const roles = new Map<string, Role>();
  for (const c of candidatesFor) for (const r of c.roles) roles.set(r.key, r);
  const pools = new Map<string, ScryfallCard[]>();
  await Promise.all(
    [...roles.values()].map(async (role) => {
      const { cards } = await searchAndCacheCards(`${baseClause(colorIdentity)} ${role.clause}`, { order: "edhrec", unique: "cards" });
      pools.set(role.key, cards);
    })
  );

  const rows: ReplacementRow[] = [];
  for (const { entry, price, roles: cardRoles } of candidatesFor) {
    const current = entry.card;
    const found = new Map<string, ReplacementOption>();
    let roleLabel = cardRoles[0].label;
    for (const role of cardRoles) {
      for (const candidate of pools.get(role.key) ?? []) {
        const key = candidate.name.toLowerCase();
        if (taken.has(key) || found.has(key) || !isSimilar(candidate, current)) continue;
        const diff = qualifies(candidate, current, price as number, mode);
        if (diff === null) continue;
        found.set(key, { card: candidate, priceDiff: diff });
        if (found.size === 1) roleLabel = role.label;
      }
    }
    if (found.size === 0) continue;
    // Most played first; for equally played cards, the bigger price change.
    const options = [...found.values()].sort((a, b) => rank(a.card) - rank(b.card) || Math.abs(b.priceDiff) - Math.abs(a.priceDiff));
    rows.push({ current, quantity: entry.quantity, role: roleLabel, options });
  }

  // Biggest money change first, and no replacement is offered for two different cards.
  const swing = (r: ReplacementRow) => Math.max(...r.options.map((o) => Math.abs(o.priceDiff)));
  rows.sort((a, b) => swing(b) - swing(a));
  const used = new Set<string>();
  const result: ReplacementRow[] = [];
  for (const row of rows) {
    const options = row.options.filter((o) => !used.has(o.card.name)).slice(0, OPTIONS_PER_CARD);
    if (options.length === 0) continue;
    for (const o of options) used.add(o.card.name);
    result.push({ ...row, options });
    if (result.length >= MAX_ROWS) break;
  }

  return { rows: result, checked: considered.length, withRole };
}
