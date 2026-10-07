import { NextResponse } from "next/server";
import { describeWait, hitRateLimit } from "./rate-limit";

// Per-user ceilings for endpoints that call Scryfall / Commander Spellbook or
// burn real CPU. Generous for hands-on use, tight enough that a loop can't
// flood them (or Scryfall on our behalf).
export const API_LIMITS = {
  simulate: { limit: 20, windowSeconds: 60 },
  suggestions: { limit: 30, windowSeconds: 60 },
  synergies: { limit: 30, windowSeconds: 60 },
  upgrades: { limit: 30, windowSeconds: 60 },
  lands: { limit: 40, windowSeconds: 60 },
  combos: { limit: 30, windowSeconds: 60 },
  search: { limit: 90, windowSeconds: 60 },
  autocomplete: { limit: 150, windowSeconds: 60 },
  addCard: { limit: 150, windowSeconds: 60 },
  importDeck: { limit: 15, windowSeconds: 60 * 60 },
  createDeck: { limit: 30, windowSeconds: 60 * 60 },
} as const;

export type LimitBucket = keyof typeof API_LIMITS;

// Returns a ready 429 response when the user is over the bucket's limit, or null
// when the request may go on. `extra` is merged into the body so clients that
// read `cards` or `suggestions` straight off the response still see empty lists.
export async function limitRequest(userId: string, bucket: LimitBucket, extra: Record<string, unknown> = {}): Promise<NextResponse | null> {
  const { limit, windowSeconds } = API_LIMITS[bucket];
  const result = await hitRateLimit(`api:${bucket}:${userId}`, limit, windowSeconds);
  if (!result.limited) return null;
  return NextResponse.json(
    { ...extra, error: `Too many requests — try again in ${describeWait(result.retryAfterSeconds)}.` },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
  );
}
