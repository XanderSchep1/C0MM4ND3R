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

export type ExportFormat = "text" | "sets" | "arena" | "mtgo" | "csv";

export const EXPORT_FORMATS: { value: ExportFormat; label: string; extension: string; hint: string }[] = [
  { value: "text", label: "Plain text", extension: "txt", hint: "Works for most deckbuilders, and for importing back here." },
  { value: "sets", label: "With set codes (Moxfield / Archidekt)", extension: "txt", hint: "Includes each card's set and collector number so the exact printing is picked." },
  { value: "arena", label: "MTG Arena", extension: "txt", hint: "Paste into Arena's Import Deck." },
  { value: "mtgo", label: "MTG Online", extension: "txt", hint: "Commander and maybeboard go in the sideboard (SB:)." },
  { value: "csv", label: "CSV spreadsheet", extension: "csv", hint: "Zone, quantity, name, set, collector number and price." },
];

type DeckLike = { commanders: DeckCardEntry[]; mainboard: DeckCardEntry[]; maybeboard: DeckCardEntry[] };

const byName = (entries: DeckCardEntry[]) => [...entries].sort((a, b) => a.card.name.localeCompare(b.card.name));
const withSet = (e: DeckCardEntry) => `${e.quantity} ${e.card.name} (${e.card.set.toUpperCase()}) ${e.card.collector_number ?? ""}`.trim();

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildExport(deck: DeckLike, format: ExportFormat): string {
  switch (format) {
    case "sets":
    case "arena": {
      const lines = (entries: DeckCardEntry[]) => byName(entries).map(withSet).join("\n");
      const sections: string[] = [];
      if (deck.commanders.length > 0) sections.push(`Commander\n${lines(deck.commanders)}`);
      sections.push(`Deck\n${lines(deck.mainboard) || "(empty)"}`);
      if (format === "sets" && deck.maybeboard.length > 0) sections.push(`Maybeboard\n${lines(deck.maybeboard)}`);
      return sections.join("\n\n") + "\n";
    }
    case "mtgo": {
      const main = byName(deck.mainboard).map((e) => `${e.quantity} ${e.card.name}`);
      const side = byName([...deck.commanders, ...deck.maybeboard]).map((e) => `SB: ${e.quantity} ${e.card.name}`);
      return [...main, ...(side.length > 0 ? ["", ...side] : [])].join("\n") + "\n";
    }
    case "csv": {
      const rows: string[] = ["Zone,Quantity,Name,Set,Collector Number,Price USD"];
      const add = (zone: string, entries: DeckCardEntry[]) => {
        for (const e of byName(entries)) {
          rows.push([zone, e.quantity, e.card.name, e.card.set.toUpperCase(), e.card.collector_number ?? "", e.card.prices?.usd ?? ""].map(csvCell).join(","));
        }
      };
      add("Commander", deck.commanders);
      add("Mainboard", deck.mainboard);
      add("Maybeboard", deck.maybeboard);
      return rows.join("\n") + "\n";
    }
    default:
      return buildDecklistText(deck);
  }
}

// ---- A plain list of cards (no deck sections), for a shopping list or a trade binder ----

export type CardListFormat = "text" | "sets" | "csv";

export const CARD_LIST_FORMATS: { value: CardListFormat; label: string; extension: string; hint: string }[] = [
  { value: "text", label: "Plain text", extension: "txt", hint: "One \"1 Card Name\" per line: paste it into TCGplayer or Cardmarket mass entry, or most deckbuilders." },
  { value: "sets", label: "With set codes", extension: "txt", hint: "Adds each card's set and collector number so the exact printing is picked." },
  { value: "csv", label: "CSV spreadsheet", extension: "csv", hint: "Quantity, name, set, collector number and price." },
];

// The cards of one list (say, every card marked "missing"), alphabetically, in the chosen format.
export function buildCardList(entries: DeckCardEntry[], format: CardListFormat): string {
  const sorted = byName(entries);
  if (sorted.length === 0) return "";
  if (format === "sets") return sorted.map(withSet).join("\n") + "\n";
  if (format === "csv") {
    const rows = sorted.map((e) => [e.quantity, e.card.name, e.card.set.toUpperCase(), e.card.collector_number ?? "", e.card.prices?.usd ?? ""].map(csvCell).join(","));
    return ["Quantity,Name,Set,Collector Number,Price USD", ...rows].join("\n") + "\n";
  }
  return sorted.map((e) => `${e.quantity} ${e.card.name}`).join("\n") + "\n";
}
