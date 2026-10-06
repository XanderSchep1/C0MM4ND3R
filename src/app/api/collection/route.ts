import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseDecklist } from "@/lib/decklist-parser";
import { describeWait, hitRateLimit } from "@/lib/rate-limit";

const MAX_TEXT_BYTES = 400_000;
const MAX_UNIQUE_CARDS = 10_000;
const CHUNK = 500;

// Same key the client uses to match deck cards against the collection.
const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (new URL(request.url).searchParams.get("view") === "full") return NextResponse.json(await fullCollection(userId));

  const rows = await prisma.ownedCard.findMany({ where: { userId }, select: { nameKey: true, quantity: true } });
  return NextResponse.json({
    cards: rows.map((r) => [r.nameKey, r.quantity] as [string, number]),
    unique: rows.length,
    total: rows.reduce((sum, r) => sum + r.quantity, 0),
  });
}

// Every owned card with a USD price when we already have the card cached.
// Prices come from the local card cache only (an exact-name match, no
// Scryfall calls), so a card we've never looked up simply shows no price.
async function fullCollection(userId: string) {
  const rows = await prisma.ownedCard.findMany({ where: { userId }, orderBy: { nameKey: "asc" }, select: { name: true, nameKey: true, quantity: true } });

  const prices = new Map<string, number>();
  const names = [...new Set(rows.map((r) => r.name))];
  for (let i = 0; i < names.length; i += 1000) {
    const chunk = names.slice(i, i + 1000);
    const found = await prisma.$queryRaw<{ name: string; usd: string | null }[]>`
      SELECT DISTINCT ON ("name") "name", "data"->'prices'->>'usd' AS usd
      FROM "CardCache"
      WHERE "name" = ANY(${chunk})
      ORDER BY "name", "updatedAt" DESC`;
    for (const f of found) if (f.usd) prices.set(f.name, parseFloat(f.usd));
  }

  const cards = rows.map((r) => ({ name: r.name, nameKey: r.nameKey, quantity: r.quantity, usd: prices.get(r.name) ?? null }));
  const value = cards.reduce((sum, c) => sum + (c.usd ?? 0) * c.quantity, 0);
  return {
    cards,
    unique: cards.length,
    total: cards.reduce((sum, c) => sum + c.quantity, 0),
    pricedCount: cards.filter((c) => c.usd !== null).length,
    value: Math.round(value * 100) / 100,
  };
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await hitRateLimit(`collection:${userId}`, 30, 60 * 60);
  if (limit.limited) return NextResponse.json({ error: `Too many updates. Try again in ${describeWait(limit.retryAfterSeconds)}.` }, { status: 429 });

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  const mode = body?.mode === "replace" ? "replace" : "merge";
  if (!text.trim()) return NextResponse.json({ error: "Paste a card list first." }, { status: 400 });
  if (text.length > MAX_TEXT_BYTES) return NextResponse.json({ error: "That list is too large." }, { status: 413 });

  // Combine duplicate lines (e.g. the same card listed twice) into one entry.
  const merged = new Map<string, { name: string; quantity: number }>();
  for (const line of parseDecklist(text)) {
    const key = nameKey(line.name);
    if (!key) continue;
    const prev = merged.get(key);
    merged.set(key, { name: line.name.trim(), quantity: (prev?.quantity ?? 0) + line.quantity });
  }
  if (merged.size === 0) return NextResponse.json({ error: "No cards found in that list." }, { status: 400 });
  if (merged.size > MAX_UNIQUE_CARDS) return NextResponse.json({ error: `Collections are limited to ${MAX_UNIQUE_CARDS} different cards.` }, { status: 413 });

  const entries = [...merged.entries()].map(([key, v]) => ({ key, ...v }));
  if (mode === "replace") await prisma.ownedCard.deleteMany({ where: { userId } });

  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const names = chunk.map((e) => e.name);
    const keys = chunk.map((e) => e.key);
    const quantities = chunk.map((e) => e.quantity);
    await prisma.$executeRaw`
      INSERT INTO "OwnedCard" ("id", "userId", "name", "nameKey", "quantity")
      SELECT gen_random_uuid()::text, ${userId}, t.n, t.k, t.q
      FROM unnest(${names}::text[], ${keys}::text[], ${quantities}::int[]) AS t(n, k, q)
      ON CONFLICT ("userId", "nameKey") DO UPDATE SET "quantity" = EXCLUDED."quantity", "name" = EXCLUDED."name"`;
  }

  const total = await prisma.ownedCard.aggregate({ where: { userId }, _count: true, _sum: { quantity: true } });
  return NextResponse.json({ imported: entries.length, unique: total._count, total: total._sum.quantity ?? 0 });
}

export async function PATCH(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const key = typeof body?.nameKey === "string" ? body.nameKey : "";
  const quantity = Number.isFinite(body?.quantity) ? Math.floor(body.quantity) : NaN;
  if (!key || Number.isNaN(quantity)) return NextResponse.json({ error: "nameKey and quantity are required." }, { status: 400 });

  if (quantity <= 0) {
    await prisma.ownedCard.deleteMany({ where: { userId, nameKey: key } });
  } else {
    const updated = await prisma.ownedCard.updateMany({ where: { userId, nameKey: key }, data: { quantity: Math.min(quantity, 999) } });
    if (updated.count === 0) return NextResponse.json({ error: "Not in your collection." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// With ?nameKey=... removes that one card; with no parameter, clears everything.
export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = new URL(request.url).searchParams.get("nameKey");
  const { count } = await prisma.ownedCard.deleteMany({ where: key ? { userId, nameKey: key } : { userId } });
  return NextResponse.json({ removed: count });
}
