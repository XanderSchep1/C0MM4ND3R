import type { ScryfallCard, ScryfallError, ScryfallList, ScryfallSet } from "./scryfall-types";

const API_BASE = "https://api.scryfall.com";
const APP_USER_AGENT = "mtg-deckbuilder/1.0 (personal commander deckbuilding app)";

// Scryfall hard rate limits (https://scryfall.com/docs/api/rate-limits):
//   /cards/search, /cards/named, /cards/random, /cards/collection -> 2/sec (500ms)
//   everything else -> 10/sec (100ms)
// We enforce a minimum gap between requests per bucket, in-process. Combined
// with the CardCache DB layer (see cards.ts) this keeps us well under the
// limit even though it isn't shared across serverless instances.
type Bucket = "throttled" | "default";
const MIN_INTERVAL_MS: Record<Bucket, number> = {
  throttled: 550,
  default: 110,
};

const lastRequestAt: Record<Bucket, number> = { throttled: 0, default: 0 };
let queue: Promise<void> = Promise.resolve();

function schedule<T>(bucket: Bucket, fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_INTERVAL_MS[bucket] - (Date.now() - lastRequestAt[bucket]);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt[bucket] = Date.now();
  });
  queue = run.catch(() => {});
  return run.then(fn);
}

class ScryfallApiError extends Error {
  status: number;
  code: string;
  constructor(err: ScryfallError) {
    super(err.details);
    this.name = "ScryfallApiError";
    this.status = err.status;
    this.code = err.code;
  }
}

async function request<T>(bucket: Bucket, path: string, init?: RequestInit): Promise<T> {
  return schedule(bucket, async () => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "User-Agent": APP_USER_AGENT,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      // Card data changes rarely; let the platform cache GETs briefly on top
      // of our own DB cache.
      next: init?.method && init.method !== "GET" ? undefined : { revalidate: 3600 },
    });
    const body = (await res.json()) as T | ScryfallError;
    if (!res.ok || (body as ScryfallError).object === "error") {
      throw new ScryfallApiError(body as ScryfallError);
    }
    return body as T;
  });
}

export interface SearchOptions {
  order?: "name" | "released" | "rarity" | "color" | "usd" | "cmc" | "power" | "toughness" | "edhrec" | "penny" | "artist";
  dir?: "auto" | "asc" | "desc";
  unique?: "cards" | "art" | "prints";
  page?: number;
  includeExtras?: boolean;
}

export async function searchCards(query: string, opts: SearchOptions = {}): Promise<ScryfallList<ScryfallCard>> {
  const params = new URLSearchParams({ q: query });
  if (opts.order) params.set("order", opts.order);
  if (opts.dir) params.set("dir", opts.dir);
  if (opts.unique) params.set("unique", opts.unique);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.includeExtras) params.set("include_extras", "true");
  try {
    return await request<ScryfallList<ScryfallCard>>("throttled", `/cards/search?${params}`);
  } catch (err) {
    if (err instanceof ScryfallApiError && err.status === 404) {
      return { object: "list", has_more: false, data: [], total_cards: 0 };
    }
    throw err;
  }
}

export async function listSets(): Promise<ScryfallSet[]> {
  const res = await request<ScryfallList<ScryfallSet>>("default", "/sets");
  return res.data;
}

export async function getCardByNameFuzzy(name: string): Promise<ScryfallCard | null> {
  try {
    return await request<ScryfallCard>("throttled", `/cards/named?fuzzy=${encodeURIComponent(name)}`);
  } catch (err) {
    if (err instanceof ScryfallApiError && err.status === 404) return null;
    throw err;
  }
}

export async function autocomplete(query: string): Promise<string[]> {
  const res = await request<{ object: "catalog"; data: string[] }>(
    "default",
    `/cards/autocomplete?q=${encodeURIComponent(query)}`
  );
  return res.data;
}

export interface CollectionIdentifier {
  id?: string;
  name?: string;
}

// POST /cards/collection accepts up to 75 identifiers per request.
export async function getCardsCollection(identifiers: CollectionIdentifier[]): Promise<{
  found: ScryfallCard[];
  notFound: CollectionIdentifier[];
}> {
  const found: ScryfallCard[] = [];
  const notFound: CollectionIdentifier[] = [];
  for (let i = 0; i < identifiers.length; i += 75) {
    const chunk = identifiers.slice(i, i + 75);
    const res = await request<{
      object: "list";
      not_found: CollectionIdentifier[];
      data: ScryfallCard[];
    }>("throttled", "/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: chunk }),
    });
    found.push(...res.data);
    notFound.push(...(res.not_found ?? []));
  }
  return { found, notFound };
}

export { ScryfallApiError };
