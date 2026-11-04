import { createHash } from "node:crypto";
import { after } from "next/server";
import { prisma } from "./prisma";
import { getCardsCollection, getCardByNameFuzzy, searchCards, type SearchOptions } from "./scryfall";
import type { ScryfallCard } from "./scryfall-types";
import { MAX_FUZZY_LOOKUPS } from "./limits";

// Gameplay data (name, oracle text, mana cost) rarely changes and Scryfall
// asks integrators not to hammer the API for it — a week-old cache entry is
// fine. Prices go stale faster but this app isn't a price tracker.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Pure cache population — no correctness requirement that every row lands
// atomically, so this intentionally isn't a transaction. A full page of search
// results is up to 175 cards (~1 MB), so rows go in a few multi-row statements
// (one round trip each) rather than one upsert per card, which took ~2 seconds
// against a remote Postgres.
const UPSERT_BATCH_SIZE = 50;

async function upsertCardsCache(cards: ScryfallCard[]): Promise<void> {
  const unique = [...new Map(cards.map((card) => [card.id, card])).values()]; // one row per id, or ON CONFLICT refuses
  for (let i = 0; i < unique.length; i += UPSERT_BATCH_SIZE) {
    const batch = unique.slice(i, i + UPSERT_BATCH_SIZE);
    const ids = batch.map((card) => card.id);
    const names = batch.map((card) => card.name);
    const data = batch.map((card) => JSON.stringify(card));
    await prisma.$executeRaw`
      INSERT INTO "CardCache" ("scryfallId", "name", "data", "updatedAt")
      SELECT t.id, t.name, t.data::jsonb, NOW()
      FROM unnest(${ids}::text[], ${names}::text[], ${data}::text[]) AS t(id, name, data)
      ON CONFLICT ("scryfallId") DO UPDATE SET "name" = EXCLUDED."name", "data" = EXCLUDED."data", "updatedAt" = NOW()`;
  }
}

// Runs `task` once the response has gone out, so cache writes never make a person wait. Outside a request
// (tests, scripts) there is nothing to wait after, so it just runs now.
async function afterResponse(task: () => Promise<unknown>): Promise<void> {
  const guarded = () =>
    task().then(
      () => undefined,
      (err) => console.error("card cache write failed", err)
    );
  try {
    after(guarded);
  } catch {
    await guarded();
  }
}

function rowToCard(row: { data: unknown }): ScryfallCard {
  return row.data as ScryfallCard;
}

export async function getCardsByIds(ids: string[]): Promise<Map<string, ScryfallCard>> {
  const uniqueIds = [...new Set(ids)];
  const result = new Map<string, ScryfallCard>();
  if (uniqueIds.length === 0) return result;

  const cached = await prisma.cardCache.findMany({ where: { scryfallId: { in: uniqueIds } } });
  const fresh = new Set<string>();
  const now = Date.now();
  for (const row of cached) {
    if (now - row.updatedAt.getTime() < CACHE_TTL_MS) {
      result.set(row.scryfallId, rowToCard(row));
      fresh.add(row.scryfallId);
    }
  }

  const missing = uniqueIds.filter((id) => !fresh.has(id));
  if (missing.length > 0) {
    const { found } = await getCardsCollection(missing.map((id) => ({ id })));
    await upsertCardsCache(found);
    for (const card of found) result.set(card.id, card);
  }

  return result;
}

export async function resolveCardByName(name: string): Promise<ScryfallCard | null> {
  const cached = await prisma.cardCache.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
  });
  if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
    return rowToCard(cached);
  }

  const card = await getCardByNameFuzzy(name);
  if (card) await upsertCardsCache([card]);
  return card;
}

// Bulk name resolution for decklist import, batched via /cards/collection
// (up to 75 names/request) instead of one fuzzy lookup per line.
export async function resolveCardsByNames(
  names: string[]
): Promise<{ resolved: Map<string, ScryfallCard>; unresolved: string[] }> {
  const resolved = new Map<string, ScryfallCard>();
  const unresolved: string[] = [];

  const { found, notFound } = await getCardsCollection(names.map((name) => ({ name })));
  await upsertCardsCache(found);
  for (const card of found) {
    const original = names.find((n) => n.toLowerCase() === card.name.toLowerCase());
    resolved.set(original ?? card.name, card);
  }

  let fuzzyLookups = 0;
  for (const miss of notFound) {
    if (!miss.name) continue;
    // Each fuzzy lookup is a separate Scryfall call, so a list full of junk
    // names can't be allowed to fire hundreds of them.
    if (fuzzyLookups >= MAX_FUZZY_LOOKUPS) {
      unresolved.push(miss.name);
      continue;
    }
    fuzzyLookups++;
    // /cards/collection requires exact names; fall back to fuzzy search for
    // typos or alternate/foreign spellings.
    const card = await resolveCardByName(miss.name);
    if (card) resolved.set(miss.name, card);
    else unresolved.push(miss.name);
  }

  return { resolved, unresolved };
}

// Search results change slowly (new printings, popularity ranks), so a day-old
// answer is fine — and it keeps repeat searches off Scryfall's rate limit.
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function searchCacheKey(query: string, opts: SearchOptions): string {
  return createHash("sha256")
    .update(JSON.stringify([query, opts.order ?? "", opts.dir ?? "", opts.unique ?? "", opts.page ?? 1, opts.includeExtras ?? false]))
    .digest("hex");
}

export async function searchAndCacheCards(
  query: string,
  opts: SearchOptions = {}
): Promise<{ cards: ScryfallCard[]; hasMore: boolean; totalCards?: number }> {
  const key = searchCacheKey(query, opts);

  const hit = await prisma.searchCache.findUnique({ where: { key } });
  if (hit && Date.now() - hit.updatedAt.getTime() < SEARCH_CACHE_TTL_MS) {
    const rows = await prisma.cardCache.findMany({ where: { scryfallId: { in: hit.cardIds } } });
    // Only trust the hit if every card it points at is still cached.
    if (rows.length === hit.cardIds.length) {
      const byId = new Map(rows.map((r) => [r.scryfallId, rowToCard(r)]));
      return { cards: hit.cardIds.map((id) => byId.get(id)!), hasMore: hit.hasMore, totalCards: hit.totalCards ?? undefined };
    }
  }

  const result = await searchCards(query, opts);
  // The answer goes back at once; remembering it (cards first, then the search that points at them) happens after.
  await afterResponse(async () => {
    await upsertCardsCache(result.data);
    const entry = { cardIds: result.data.map((c) => c.id), hasMore: result.has_more, totalCards: result.total_cards ?? null };
    await prisma.searchCache.upsert({ where: { key }, create: { key, ...entry }, update: entry });
  });
  return { cards: result.data, hasMore: result.has_more, totalCards: result.total_cards };
}
