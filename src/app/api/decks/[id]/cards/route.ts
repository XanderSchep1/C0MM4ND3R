import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCardsByIds } from "@/lib/cards";

type Zone = "commander" | "mainboard" | "maybeboard";
const ZONES: Zone[] = ["commander", "mainboard", "maybeboard"];

async function authorizeDeck(deckId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const deck = await prisma.deck.findFirst({ where: { id: deckId, userId: session.user.id } });
  if (!deck) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { deck } as const;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth_ = await authorizeDeck(id);
  if ("error" in auth_) return auth_.error;

  const body = await request.json().catch(() => ({}));
  const scryfallId = typeof body.scryfallId === "string" ? body.scryfallId : "";
  const zone: Zone = ZONES.includes(body.zone) ? body.zone : "mainboard";
  const quantity = Number.isFinite(body.quantity) && body.quantity > 0 ? Math.floor(body.quantity) : 1;
  if (!scryfallId) return NextResponse.json({ error: "scryfallId is required" }, { status: 400 });

  const cardMap = await getCardsByIds([scryfallId]);
  const card = cardMap.get(scryfallId);
  if (!card) return NextResponse.json({ error: "Unknown Scryfall card id" }, { status: 400 });

  await prisma.deckCard.upsert({
    where: { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } },
    create: { deckId: id, scryfallId, name: card.name, zone, quantity },
    update: { quantity: { increment: quantity } },
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
  const quantity = Number.isFinite(body.quantity) ? Math.floor(body.quantity) : existing.quantity;

  if (newZone && newZone !== zone) {
    await prisma.$transaction([
      prisma.deckCard.delete({ where: { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } } }),
      prisma.deckCard.upsert({
        where: { deckId_scryfallId_zone: { deckId: id, scryfallId, zone: newZone } },
        create: { deckId: id, scryfallId, name: existing.name, zone: newZone, quantity: Math.max(1, quantity) },
        update: { quantity: { increment: Math.max(1, quantity) } },
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
