import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOwnedDeck, resolveDeck } from "@/lib/deck-data";
import { colorIdentityUnion } from "@/lib/card-helpers";
import { computeLandBalance } from "@/lib/land-balance";
import { LAND_CATEGORIES, suggestLands } from "@/lib/land-suggest";

async function loadDeck(params: Promise<{ id: string }>) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const { id } = await params;
  const deck = await getOwnedDeck(id, session.user.id);
  if (!deck) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  const resolved = await resolveDeck(deck);
  if (resolved.commanders.length === 0) {
    return { error: NextResponse.json({ error: "Pick a commander before balancing lands" }, { status: 400 }) } as const;
  }
  const colorIdentity = colorIdentityUnion(resolved.commanders.map((c) => c.card));
  return { resolved, colorIdentity } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const loaded = await loadDeck(params);
  if ("error" in loaded) return loaded.error;
  const { resolved, colorIdentity } = loaded;
  return NextResponse.json({
    categories: LAND_CATEGORIES.map(({ key, label, description }) => ({ key, label, description })),
    balance: computeLandBalance(resolved.commanders, resolved.mainboard, colorIdentity),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const loaded = await loadDeck(params);
  if ("error" in loaded) return loaded.error;
  const { resolved, colorIdentity } = loaded;

  const body = await request.json().catch(() => ({}));
  const known = new Set(LAND_CATEGORIES.map((c) => c.key));
  const categories: string[] = Array.isArray(body.categories) ? body.categories.filter((k: unknown): k is string => typeof k === "string" && known.has(k)) : [];
  const names: string[] = Array.isArray(body.names)
    ? body.names.filter((n: unknown): n is string => typeof n === "string").map((n: string) => n.trim().slice(0, 80)).filter(Boolean).slice(0, 10)
    : [];

  const balance = computeLandBalance(resolved.commanders, resolved.mainboard, colorIdentity);
  const { suggestions, notes } = await suggestLands({
    commanders: resolved.commanders,
    mainboard: resolved.mainboard,
    maybeboard: resolved.maybeboard,
    colorIdentity,
    balance,
    categories,
    names,
  });

  return NextResponse.json({ suggestions, notes, balance });
}
