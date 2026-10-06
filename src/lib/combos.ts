// Client for the Commander Spellbook public API (backend.commanderspellbook.com),
// the same backend that powers their "Find My Combos" feature. Used to find
// combos the deck can already pull off, or is one/two cards away from.
// https://commanderspellbook.com/syntax-guide/ documents the query syntax.

const API_BASE = "https://backend.commanderspellbook.com";
const USER_AGENT = "mtg-deckbuilder/1.0 (personal commander deckbuilding app)";

// No documented rate limit, but we self-throttle and batch queries by the
// deck's own card names (mirroring their own feature's usage pattern)
// rather than bulk-fetching, to stay a light, well-behaved caller.
const MIN_INTERVAL_MS = 400;
let lastRequestAt = 0;

async function throttledGet(url: string): Promise<{ results: unknown[] }> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Commander Spellbook API error: ${res.status}`);
  return res.json();
}

export interface ComboCardRef {
  oracleId: string;
  name: string;
  imageUri?: string;
}

export interface ComboVariant {
  id: string;
  cards: ComboCardRef[];
  produces: string[];
  identity: string;
  popularity: number;
  description: string;
}

interface RawVariant {
  id: string;
  identity: string;
  popularity: number | null;
  description?: string;
  uses: { card: { oracleId: string; name: string; imageUriFrontNormal?: string | null; imageUriFrontSmall?: string | null } }[];
  produces: { feature: { name: string } }[];
}

function escapeCardName(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const BATCH_SIZE = 15;
const MAX_COMBO_SIZE = 4;

// Queries in batches of card names (OR'd together) rather than one giant
// query, both to stay under sane URL lengths and because it mirrors how
// their site's own "Find My Combos" feature is used.
export async function findCombosForCardNames(names: string[], colorIdentity: string[]): Promise<ComboVariant[]> {
  const uniqueNames = [...new Set(names)];
  const identityClause = `coloridentity<=${colorIdentity.length ? colorIdentity.join("").toLowerCase() : "c"}`;
  const variantsById = new Map<string, ComboVariant>();

  for (let i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
    const batch = uniqueNames.slice(i, i + BATCH_SIZE);
    const cardClause = batch.map((n) => `card="${escapeCardName(n)}"`).join(" or ");
    const q = `(${cardClause}) ${identityClause} cards<=${MAX_COMBO_SIZE}`;
    const url = `${API_BASE}/variants/?limit=75&q=${encodeURIComponent(q)}`;

    let data: { results: RawVariant[] };
    try {
      data = (await throttledGet(url)) as { results: RawVariant[] };
    } catch {
      continue; // one bad batch shouldn't sink the whole search
    }

    for (const v of data.results ?? []) {
      if (variantsById.has(v.id)) continue;
      variantsById.set(v.id, {
        id: v.id,
        identity: v.identity,
        popularity: v.popularity ?? 0,
        description: v.description ?? "",
        produces: (v.produces ?? []).map((p) => p.feature?.name).filter(Boolean),
        cards: (v.uses ?? []).map((u) => ({
          oracleId: u.card.oracleId,
          name: u.card.name,
          imageUri: u.card.imageUriFrontNormal ?? u.card.imageUriFrontSmall ?? undefined,
        })),
      });
    }
  }

  return [...variantsById.values()].sort((a, b) => b.popularity - a.popularity);
}

export interface ComboOpportunity {
  variant: ComboVariant;
  missing: ComboCardRef[];
}

const MAX_MISSING = 2;

export function findComboOpportunities(
  variants: ComboVariant[],
  ownedOracleIds: Set<string>
): { complete: ComboVariant[]; near: ComboOpportunity[] } {
  const complete: ComboVariant[] = [];
  const near: ComboOpportunity[] = [];

  for (const variant of variants) {
    const missing = variant.cards.filter((c) => !ownedOracleIds.has(c.oracleId));
    if (missing.length === 0) complete.push(variant);
    else if (missing.length <= MAX_MISSING) near.push({ variant, missing });
  }

  return { complete, near };
}
