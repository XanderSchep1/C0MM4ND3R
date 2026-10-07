import { prisma } from "./prisma";
import { getCardsByIds } from "./cards";
import type { ScryfallCard } from "./scryfall-types";
import type { DeckCardEntry } from "./commander";
import { toMark } from "./card-mark";

export async function getOwnedDeck(deckId: string, userId: string) {
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
    include: { cards: true },
  });
  return deck;
}

export interface ResolvedDeck {
  id: string;
  name: string;
  format: string;
  description: string | null;
  public: boolean;
  commanders: DeckCardEntry[];
  mainboard: DeckCardEntry[];
  maybeboard: DeckCardEntry[];
  unresolved: { scryfallId: string; name: string; zone: string; quantity: number }[];
}

// `withMarks` adds the owner's yellow/red highlights to each entry. They are left
// out unless asked for, so a page anyone can open (the share page) can never leak them.
export async function resolveDeck(
  deck: {
    id: string;
    name: string;
    format: string;
    description: string | null;
    public: boolean;
    cards: { scryfallId: string; name: string; quantity: number; zone: string; mark?: string | null }[];
  },
  options: { withMarks?: boolean } = {}
): Promise<ResolvedDeck> {
  const cardMap = await getCardsByIds(deck.cards.map((c) => c.scryfallId));

  const commanders: DeckCardEntry[] = [];
  const mainboard: DeckCardEntry[] = [];
  const maybeboard: DeckCardEntry[] = [];
  const unresolved: ResolvedDeck["unresolved"] = [];

  for (const row of deck.cards) {
    const card: ScryfallCard | undefined = cardMap.get(row.scryfallId);
    if (!card) {
      unresolved.push({ scryfallId: row.scryfallId, name: row.name, zone: row.zone, quantity: row.quantity });
      continue;
    }
    const entry: DeckCardEntry = options.withMarks ? { card, quantity: row.quantity, mark: toMark(row.mark) } : { card, quantity: row.quantity };
    if (row.zone === "commander") commanders.push(entry);
    else if (row.zone === "maybeboard") maybeboard.push(entry);
    else mainboard.push(entry);
  }

  return {
    id: deck.id,
    name: deck.name,
    format: deck.format,
    description: deck.description,
    public: deck.public,
    commanders,
    mainboard,
    maybeboard,
    unresolved,
  };
}
