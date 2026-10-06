import { listSets } from "./scryfall";

// Only set types that print cards legal and playable in Commander —
// excludes tokens, promos, memorabilia, Alchemy, etc.
const RELEVANT_SET_TYPES = new Set(["core", "expansion", "commander", "masters", "draft_innovation"]);

// How far back a set still counts as "recent" for upgrade checks.
const RECENT_WINDOW_DAYS = 120;

const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { at: number; sets: SetInfo[] } | null = null;

export interface SetInfo {
  code: string;
  name: string;
  releasedAt: string;
  setType: string;
  cardCount: number;
  iconSvgUri?: string;
}

// Newest first. Upcoming (not-yet-released) sets are left out — their card
// lists are spoilers that aren't legal to play or buy yet.
export async function getRecentSets(): Promise<SetInfo[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.sets;

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const all = await listSets();
  const sets = all
    .filter((s) => !s.digital && RELEVANT_SET_TYPES.has(s.set_type) && s.card_count > 0 && s.released_at && s.released_at <= today && s.released_at >= cutoff)
    .map((s) => ({
      code: s.code,
      name: s.name,
      releasedAt: s.released_at as string,
      setType: s.set_type,
      cardCount: s.card_count,
      iconSvgUri: s.icon_svg_uri,
    }))
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));

  cache = { at: Date.now(), sets };
  return sets;
}
