import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCardsByIds } from "@/lib/cards";
import { limitRequest } from "@/lib/api-guard";
import { clampQuantity, MAX_DECK_ROWS } from "@/lib/limits";

type Zone = "commander" | "mainboard" | "maybeboard";
const ZONES: Zone[] = ["commander", "mainboard", "maybeboard"];

async function authorizeDeck(deckId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const deck = await prisma.deck.findFirst({ where: { id: deckId, userId: session.user.id } });
  if (!deck) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { deck, userId: session.user.id } as const;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth_ = await authorizeDeck(id);
  if ("error" in auth_) return auth_.error;
  const limited = await limitRequest(auth_.userId, "addCard");
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const scryfallId = typeof body.scryfallId === "string" ? body.scryfallId.slice(0, 64) : "";
  const zone: Zone = ZONES.includes(body.zone) ? body.zone : "mainboard";
  const quantity = clampQuantity(Number(body.quantity));
  if (!scryfallId) return NextResponse.json({ error: "scryfallId is required" }, { status: 400 });

  const cardMap = await getCardsByIds([scryfallId]);
  const card = cardMap.get(scryfallId);
  if (!card) return NextResponse.json({ error: "Unknown Scryfall card id" }, { status: 400 });

  const key = { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } };
  const existing = await prisma.deckCard.findUnique({ where: key });
  if (!existing && (await prisma.deckCard.count({ where: { deckId: id } })) >= MAX_DECK_ROWS) {
    return NextResponse.json({ error: `A deck can hold at most ${MAX_DECK_ROWS} different cards.` }, { status: 400 });
  }
  const next = clampQuantity((existing?.quantity ?? 0) + quantity);
  await prisma.deckCard.upsert({
    where: key,
    create: { deckId: id, scryfallId, name: card.name, zone, quantity: next },
    update: { quantity: next },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth_ = await authorizeDeck(id);
  if ("error" in auth_) return auth_.error;

  const body = await request.json().catch(() => ({}));
  const scryfallId = typeof body.scryfallId === "string" ? body.scryfallId : "";
  const zone: Zone = ZONES.includes(body.zone) ? body.zone : "mainboard";
  if (!scryfallId) return NextResponse.json({ error: "scryfallId is required" }, { status: 400 });

  const existing = await prisma.deckCard.findUnique({
    where: { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newZone: Zone | undefined = ZONES.includes(body.newZone) ? body.newZone : undefined;
  const quantity = Number.isFinite(body.quantity) ? clampQuantity(body.quantity, 0) : existing.quantity;

  if (newZone && newZone !== zone) {
    const targetKey = { deckId_scryfallId_zone: { deckId: id, scryfallId, zone: newZone } };
    const target = await prisma.deckCard.findUnique({ where: targetKey });
    const moved = clampQuantity((target?.quantity ?? 0) + Math.max(1, quantity));
    await prisma.$transaction([
      prisma.deckCard.delete({ where: { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } } }),
      prisma.deckCard.upsert({
        where: targetKey,
        create: { deckId: id, scryfallId, name: existing.name, zone: newZone, quantity: moved },
        update: { quantity: moved },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (quantity <= 0) {
    await prisma.deckCard.delete({ where: { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } } });
  } else {
    await prisma.deckCard.update({ where: { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } }, data: { quantity } });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth_ = await authorizeDeck(id);
  if ("error" in auth_) return auth_.error;

  const url = new URL(request.url);
  const scryfallId = url.searchParams.get("scryfallId") ?? "";
  const zone: Zone = ZONES.includes(url.searchParams.get("zone") as Zone) ? (url.searchParams.get("zone") as Zone) : "mainboard";
  if (!scryfallId) return NextResponse.json({ error: "scryfallId is required" }, { status: 400 });

  await prisma.deckCard.deleteMany({ where: { deckId: id, scryfallId, zone } });
  return NextResponse.json({ ok: true });
}
