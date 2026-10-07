import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCardsByIds } from "@/lib/cards";
import { limitRequest } from "@/lib/api-guard";
import { getDeckAccess } from "@/lib/deck-access";
import { clampQuantity, MAX_DECK_ROWS, MAX_SUGGESTIONS_PER_FRIEND } from "@/lib/limits";
import { parseMarkInput } from "@/lib/card-mark";
import { isSameCard } from "@/lib/printings";

type Zone = "commander" | "mainboard" | "maybeboard";
const ZONES: Zone[] = ["commander", "mainboard", "maybeboard"];

const forbidden = (message: string) => NextResponse.json({ error: message }, { status: 403 });

// Who may do what here:
//  - the deck's owner: everything, as before;
//  - a friend invited to the deck ("contributor"): suggest cards into the Maybeboard (each tagged with
//    their id), and change or remove only those suggestions. Never the Mainboard, the commander,
//    highlights, art or moves: those are the owner's deck.
async function authorizeDeck(deckId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const access = await getDeckAccess(deckId, session.user.id);
  if (!access) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { deck: access.deck, role: access.role, userId: session.user.id } as const;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth_ = await authorizeDeck(id);
  if ("error" in auth_) return auth_.error;
  const { role, userId } = auth_;
  const limited = await limitRequest(userId, "addCard");
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const scryfallId = typeof body.scryfallId === "string" ? body.scryfallId.slice(0, 64) : "";
  if (!scryfallId) return NextResponse.json({ error: "scryfallId is required" }, { status: 400 });

  if (role === "contributor" && body.zone !== undefined && body.zone !== "maybeboard") {
    return forbidden("Friends can only suggest cards for the Maybeboard.");
  }
  const zone: Zone = role === "contributor" ? "maybeboard" : ZONES.includes(body.zone) ? body.zone : "mainboard";
  const quantity = role === "contributor" ? 1 : clampQuantity(Number(body.quantity));

  const cardMap = await getCardsByIds([scryfallId]);
  const card = cardMap.get(scryfallId);
  if (!card) return NextResponse.json({ error: "Unknown Scryfall card id" }, { status: 400 });

  if (role === "contributor") {
    // A suggestion is for something the deck doesn't have yet (in any printing, any zone).
    if (await prisma.deckCard.findFirst({ where: { deckId: id, name: card.name }, select: { id: true } })) {
      return NextResponse.json({ error: "That card is already in the deck." }, { status: 409 });
    }
    if ((await prisma.deckCard.count({ where: { deckId: id, addedById: userId } })) >= MAX_SUGGESTIONS_PER_FRIEND) {
      return NextResponse.json({ error: `You have ${MAX_SUGGESTIONS_PER_FRIEND} suggestions waiting. Ask the owner to go through them first.` }, { status: 400 });
    }
    if ((await prisma.deckCard.count({ where: { deckId: id } })) >= MAX_DECK_ROWS) {
      return NextResponse.json({ error: `A deck can hold at most ${MAX_DECK_ROWS} different cards.` }, { status: 400 });
    }
    await prisma.deckCard.create({ data: { deckId: id, scryfallId, name: card.name, zone, quantity, addedById: userId } });
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const key = { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } };
  const existing = await prisma.deckCard.findUnique({ where: key });
  if (!existing && (await prisma.deckCard.count({ where: { deckId: id } })) >= MAX_DECK_ROWS) {
    return NextResponse.json({ error: `A deck can hold at most ${MAX_DECK_ROWS} different cards.` }, { status: 400 });
  }
  const next = clampQuantity((existing?.quantity ?? 0) + quantity);
  // Adding a card a friend suggested makes it the owner's own.
  await prisma.deckCard.upsert({
    where: key,
    create: { deckId: id, scryfallId, name: card.name, zone, quantity: next },
    update: { quantity: next, addedById: null },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth_ = await authorizeDeck(id);
  if ("error" in auth_) return auth_.error;
  const { role, userId } = auth_;

  const body = await request.json().catch(() => ({}));
  const scryfallId = typeof body.scryfallId === "string" ? body.scryfallId : "";
  const zone: Zone = ZONES.includes(body.zone) ? body.zone : "mainboard";
  if (!scryfallId) return NextResponse.json({ error: "scryfallId is required" }, { status: 400 });

  const existing = await prisma.deckCard.findUnique({
    where: { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (role === "contributor") {
    if ("mark" in body || "printingId" in body || "newZone" in body) return forbidden("Only the deck's owner can do that.");
    if (zone !== "maybeboard" || existing.addedById !== userId) return forbidden("You can only change cards you suggested.");
    const quantity = Number.isFinite(body.quantity) ? clampQuantity(body.quantity, 0) : existing.quantity;
    const key = { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } };
    if (quantity <= 0) await prisma.deckCard.delete({ where: key });
    else await prisma.deckCard.update({ where: key, data: { quantity } });
    return NextResponse.json({ ok: true });
  }

  // Highlighting a line (yellow = owned, red = missing, null = clear) changes nothing else.
  if ("mark" in body) {
    const mark = parseMarkInput(body.mark);
    if (mark === undefined) return NextResponse.json({ error: "mark must be \"owned\", \"missing\" or null" }, { status: 400 });
    await prisma.deckCard.update({ where: { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } }, data: { mark } });
    return NextResponse.json({ ok: true });
  }

  // Choosing art: point this line at another printing of the same card.
  if ("printingId" in body) {
    const printingId = typeof body.printingId === "string" ? body.printingId.slice(0, 64) : "";
    if (!printingId) return NextResponse.json({ error: "printingId is required" }, { status: 400 });
    if (printingId === scryfallId) return NextResponse.json({ ok: true });

    const cards = await getCardsByIds([scryfallId, printingId]);
    const current = cards.get(scryfallId);
    const next = cards.get(printingId);
    if (!current || !next) return NextResponse.json({ error: "Unknown printing" }, { status: 400 });
    if (!isSameCard(current, next)) return NextResponse.json({ error: "That printing is a different card" }, { status: 400 });

    const currentKey = { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } };
    const target = await prisma.deckCard.findUnique({ where: { deckId_scryfallId_zone: { deckId: id, scryfallId: printingId, zone } } });
    if (target) {
      // The deck already has that printing here: fold this line into it.
      await prisma.$transaction([
        prisma.deckCard.delete({ where: currentKey }),
        prisma.deckCard.update({
          where: { deckId_scryfallId_zone: { deckId: id, scryfallId: printingId, zone } },
          data: { quantity: clampQuantity(target.quantity + existing.quantity) },
        }),
      ]);
    } else {
      await prisma.deckCard.update({ where: currentKey, data: { scryfallId: printingId } });
    }
    return NextResponse.json({ ok: true });
  }

  const newZone: Zone | undefined = ZONES.includes(body.newZone) ? body.newZone : undefined;
  const quantity = Number.isFinite(body.quantity) ? clampQuantity(body.quantity, 0) : existing.quantity;

  if (newZone && newZone !== zone) {
    const targetKey = { deckId_scryfallId_zone: { deckId: id, scryfallId, zone: newZone } };
    const target = await prisma.deckCard.findUnique({ where: targetKey });
    const moved = clampQuantity((target?.quantity ?? 0) + Math.max(1, quantity));
    // A friend's suggestion that leaves the Maybeboard has been accepted: from then on it's the owner's card.
    const author = newZone === "maybeboard" ? existing.addedById : null;
    await prisma.$transaction([
      prisma.deckCard.delete({ where: { deckId_scryfallId_zone: { deckId: id, scryfallId, zone } } }),
      prisma.deckCard.upsert({
        where: targetKey,
        create: { deckId: id, scryfallId, name: existing.name, zone: newZone, quantity: moved, mark: existing.mark, addedById: author },
        update: { quantity: moved, ...(newZone === "maybeboard" ? {} : { addedById: null }) },
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
  const { role, userId } = auth_;

  const url = new URL(request.url);
  const scryfallId = url.searchParams.get("scryfallId") ?? "";
  const zone: Zone = ZONES.includes(url.searchParams.get("zone") as Zone) ? (url.searchParams.get("zone") as Zone) : "mainboard";
  if (!scryfallId) return NextResponse.json({ error: "scryfallId is required" }, { status: 400 });

  if (role === "contributor") {
    if (zone !== "maybeboard") return forbidden("You can only remove cards you suggested.");
    const removed = await prisma.deckCard.deleteMany({ where: { deckId: id, scryfallId, zone: "maybeboard", addedById: userId } });
    if (removed.count === 0) return forbidden("You can only remove cards you suggested.");
    return NextResponse.json({ ok: true });
  }

  await prisma.deckCard.deleteMany({ where: { deckId: id, scryfallId, zone } });
  return NextResponse.json({ ok: true });
}
