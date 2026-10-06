import type { DeckCardEntry } from "./commander";

function formatZone(entries: DeckCardEntry[]): string {
  return [...entries]
    .sort((a, b) => a.card.name.localeCompare(b.card.name))
    .map((e) => `${e.quantity} ${e.card.name}`)
    .join("\n");
}

// Plain "qty name" text, one card per line, grouped under section headers —
// the same shape our own decklist-parser.ts round-trips back in, and the
// convention most other deckbuilders (Moxfield, Archidekt, MTGGoldfish) read.
export function buildDecklistText(deck: { commanders: DeckCardEntry[]; mainboard: DeckCardEntry[]; maybeboard: DeckCardEntry[] }): string {
  const sections: string[] = [];
  if (deck.commanders.length > 0) sections.push(`Commander\n${formatZone(deck.commanders)}`);
  sections.push(`Deck\n${formatZone(deck.mainboard) || "(empty)"}`);
  if (deck.maybeboard.length > 0) sections.push(`Maybeboard\n${formatZone(deck.maybeboard)}`);
  return sections.join("\n\n") + "\n";
}
