import { prisma } from "./prisma";
import { getCardsCollection, getCardByNameFuzzy, searchCards, type SearchOptions } from "./scryfall";
import type { ScryfallCard } from "./scryfall-types";

// Gameplay data (name, oracle text, mana cost) rarely changes and Scryfall
// asks integrators not to hammer the API for it — a week-old cache entry is
// fine. Prices go stale faster but this app isn't a price tracker.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Pure cache population — no correctness requirement that every row lands
// atomically, so this intentionally isn't a transaction. A single
// `$transaction` over a full page of search results (up to 175 cards) was
// prone to blowing Prisma's default 5s interactive-transaction timeout
// against a remote Postgres; batching plain upserts avoids both that and
// opening too many connections at once.
const UPSERT_BATCH_SIZE = 20;

async function upsertCardsCache(cards: ScryfallCard[]): Promise<void> {
  for (let i = 0; i < cards.length; i += UPSERT_BATCH_SIZE) {
    const batch = cards.slice(i, i + UPSERT_BATCH_SIZE);
    await Promise.all(
      batch.map((card) =>
        prisma.cardCache.upsert({
          where: { scryfallId: card.id },
          create: { scryfallId: card.id, name: card.name, data: card as unknown as object },
          update: { name: card.name, data: card as unknown as object },
        })
      )
    );
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

  for (const miss of notFound) {
    if (!miss.name) continue;
    // /cards/collection requires exact names; fall back to fuzzy search for
    // typos or alternate/foreign spellings.
    const card = await resolveCardByName(miss.name);
    if (card) resolved.set(miss.name, card);
    else unresolved.push(miss.name);
  }

  return { resolved, unresolved };
}

export async function searchAndCacheCards(
  query: string,
  opts?: SearchOptions
): Promise<{ cards: ScryfallCard[]; hasMore: boolean; totalCards?: number }> {
  const result = await searchCards(query, opts);
  await upsertCardsCache(result.data);
  return { cards: result.data, hasMore: result.has_more, totalCards: result.total_cards };
}
