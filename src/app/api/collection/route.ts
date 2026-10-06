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

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.ownedCard.findMany({ where: { userId }, select: { nameKey: true, quantity: true } });
  return NextResponse.json({
    cards: rows.map((r) => [r.nameKey, r.quantity] as [string, number]),
    unique: rows.length,
    total: rows.reduce((sum, r) => sum + r.quantity, 0),
  });
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

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { count } = await prisma.ownedCard.deleteMany({ where: { userId } });
  return NextResponse.json({ removed: count });
}
