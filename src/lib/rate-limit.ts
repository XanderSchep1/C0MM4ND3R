import { prisma } from "./prisma";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
}

// Fixed-window counter shared by every serverless instance (it lives in
// Postgres). One atomic upsert both counts this attempt and rolls the window
// over when it has expired, so concurrent requests can't slip past the limit.
export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowSeconds * 1000);

  const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < ${cutoff} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < ${cutoff} THEN ${now} ELSE "RateLimit"."windowStart" END
    RETURNING "count", "windowStart"`;

  // Opportunistic cleanup so the table doesn't grow forever.
  if (Math.random() < 0.02) {
    await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - STALE_AFTER_MS) } } });
  }

  const { count, windowStart } = rows[0];
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now.getTime()) / 1000));
  return { limited: count > limit, retryAfterSeconds };
}

// Vercel puts the real client address first in x-forwarded-for.
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}

export function describeWait(seconds: number): string {
  return seconds >= 120 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
}
