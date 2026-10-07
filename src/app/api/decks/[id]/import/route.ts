import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { limitRequest } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { parseDecklist, type DeckZone } from "@/lib/decklist-parser";
import { resolveCardsByNames } from "@/lib/cards";
import { clampQuantity, MAX_DECK_ROWS, MAX_IMPORT_CHARS, MAX_IMPORT_LINES } from "@/lib/limits";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest(session.user.id, "importDeck");
  if (limited) return limited;

  const { id } = await params;
  const deck = await prisma.deck.findFirst({ where: { id, userId: session.user.id } });
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";
  const mode = body.mode === "replace" ? "replace" : "merge";
  if (!text.trim()) return NextResponse.json({ error: "Paste a decklist first" }, { status: 400 });
  if (text.length > MAX_IMPORT_CHARS) return NextResponse.json({ error: "That decklist is too large." }, { status: 413 });

  const lines = parseDecklist(text);
  if (lines.length === 0) return NextResponse.json({ error: "Couldn't find any card lines in that text" }, { status: 400 });
  if (lines.length > MAX_IMPORT_LINES) {
    return NextResponse.json({ error: `That list has more than ${MAX_IMPORT_LINES} card lines — is it really a single deck?` }, { status: 413 });
  }

  const uniqueNames = [...new Set(lines.map((l) => l.name))];
  const { resolved, unresolved } = await resolveCardsByNames(uniqueNames);

  // Work out the final quantity of every (card, zone) row first, so a list that
  // would overflow the deck is rejected before anything is written.
  const rowKey = (scryfallId: string, zone: DeckZone) => `${scryfallId}|${zone}`;
  const rows = new Map<string, { scryfallId: string; name: string; zone: DeckZone; quantity: number }>();
  if (mode === "merge") {
    const existing = await prisma.deckCard.findMany({ where: { deckId: id } });
    for (const row of existing) {
      rows.set(rowKey(row.scryfallId, row.zone as DeckZone), { scryfallId: row.scryfallId, name: row.name, zone: row.zone as DeckZone, quantity: row.quantity });
    }
  }

  let added = 0;
  const touched = new Set<string>();
  for (const line of lines) {
    const card = resolved.get(line.name);
    if (!card) continue;
    const key = rowKey(card.id, line.zone);
    const quantity = clampQuantity(line.quantity);
    const prev = rows.get(key);
    rows.set(key, { scryfallId: card.id, name: card.name, zone: line.zone, quantity: clampQuantity((prev?.quantity ?? 0) + quantity) });
    touched.add(key);
    added += quantity;
  }
  if (rows.size > MAX_DECK_ROWS) {
    return NextResponse.json({ error: `A deck can hold at most ${MAX_DECK_ROWS} different cards.` }, { status: 400 });
  }

  // One transaction, so a failure part-way through never leaves a replaced deck half-empty.
  await prisma.$transaction([
    ...(mode === "replace" ? [prisma.deckCard.deleteMany({ where: { deckId: id } })] : []),
    ...[...touched].map((key) => {
      const row = rows.get(key)!;
      return prisma.deckCard.upsert({
        where: { deckId_scryfallId_zone: { deckId: id, scryfallId: row.scryfallId, zone: row.zone } },
        create: { deckId: id, scryfallId: row.scryfallId, name: row.name, zone: row.zone, quantity: row.quantity },
        update: { quantity: row.quantity },
      });
    }),
  ]);

  return NextResponse.json({ added, unresolved });
}
