import { prisma } from "./prisma";

// A deck is reached in one of two ways: you own it, or its owner invited you as a contributor.
export type DeckRole = "owner" | "contributor";

// What each role may do. The API routes check these, and so does the page (to hide what you can't use).
export const CAN = {
  // Owners only: everything about the deck itself.
  edit: (role: DeckRole) => role === "owner",
  // Contributors suggest cards: they land in the Maybeboard, tagged with who added them.
  suggest: (role: DeckRole) => role === "owner" || role === "contributor",
} as const;

const reachableBy = (deckId: string, userId: string) => ({ id: deckId, OR: [{ userId }, { collaborators: { some: { userId } } }] });
const roleFor = (deckOwnerId: string, userId: string): DeckRole => (deckOwnerId === userId ? "owner" : "contributor");

// The deck, if you may open it at all, and in which role. Anyone else gets null (the routes answer 404,
// so a deck's existence isn't revealed to people it isn't shared with). Most routes only need this.
export async function getDeckAccess(deckId: string, userId: string) {
  const deck = await prisma.deck.findFirst({ where: reachableBy(deckId, userId), include: { user: { select: { id: true, name: true, email: true } } } });
  return deck ? { deck, role: roleFor(deck.userId, userId) } : null;
}

// The same, plus the deck's cards and who suggested each one (for pages and routes that show the deck).
export async function getDeckAccessWithCards(deckId: string, userId: string) {
  const deck = await prisma.deck.findFirst({
    where: reachableBy(deckId, userId),
    include: { user: { select: { id: true, name: true, email: true } }, cards: { include: { addedBy: { select: { id: true, name: true, email: true } } } } },
  });
  return deck ? { deck, role: roleFor(deck.userId, userId) } : null;
}

export const personName = (user: { name: string | null; email: string | null }) => user.name?.trim() || user.email?.split("@")[0] || "Someone";
