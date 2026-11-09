import { cache } from "react";
import { prisma } from "./prisma";
import { resolveDeck } from "./deck-data";

// A deck its owner has opened to anyone with the link. The id (a cuid) is the unguessable token.
// `cache` makes the page and its metadata share one lookup per request.

// The whole deck, as a stranger may see it: no highlights and no names of who suggested what
// (resolveDeck leaves both out unless asked).
export const loadPublicDeck = cache(async (id: string) => {
  const deck = await prisma.deck.findFirst({ where: { id, public: true }, include: { cards: true } });
  return deck ? resolveDeck(deck) : null;
});

// Just enough for a link preview (title and description), without resolving every card.
export const loadPublicDeckSummary = cache(async (id: string) => {
  const deck = await prisma.deck.findFirst({
    where: { id, public: true },
    select: { name: true, description: true, cards: { where: { zone: "commander" }, select: { name: true } } },
  });
  return deck ? { name: deck.name, description: deck.description, commanders: deck.cards.map((c) => c.name) } : null;
});

export function deckDescription(summary: { description: string | null; commanders: string[] }): string {
  return summary.description ?? `A Commander deck${summary.commanders.length > 0 ? ` led by ${summary.commanders.join(" & ")}` : ""}.`;
}
