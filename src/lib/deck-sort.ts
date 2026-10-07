import { priceValue, primaryTypeCategory, TYPE_CATEGORY_ORDER } from "./card-helpers";
import type { DeckCardEntry } from "./commander";

// How the deck list is ordered. "Grouped" sorts put cards under headers (Creature, Sorcery… / 0, 1,
// 2… / White, Blue…); "flat" sorts (name, price, popularity) are one long list.

export const SORT_KEYS = ["type", "cmc", "name", "price", "color", "highlight", "popularity"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface SortState {
  key: SortKey;
  descending: boolean;
}

export const SORT_LABELS: Record<SortKey, string> = {
  type: "Card type",
  cmc: "Mana value",
  name: "Name",
  price: "Price",
  color: "Color",
  highlight: "Highlight",
  popularity: "Popularity",
};

// [what the arrow means when ascending, when descending]
const DIRECTION_LABELS: Record<SortKey, [string, string]> = {
  type: ["Standard order", "Reversed"],
  cmc: ["Lowest first", "Highest first"],
  name: ["A → Z", "Z → A"],
  price: ["Lowest first", "Highest first"],
  color: ["W U B R G first", "Reversed"],
  highlight: ["Owned, then missing", "Not highlighted first"],
  popularity: ["Most played first", "Least played first"],
};

export const DEFAULT_SORT: SortState = { key: "type", descending: false };

// Price starts with the dearest card at the top; everything else starts in its natural order.
export function sortFor(key: SortKey): SortState {
  return { key, descending: key === "price" };
}

export function directionLabel(sort: SortState): string {
  return DIRECTION_LABELS[sort.key][sort.descending ? 1 : 0];
}

// Anything unexpected (old or hand-edited saved settings) falls back to the default.
export function parseSort(value: unknown): SortState {
  if (typeof value !== "object" || value === null) return DEFAULT_SORT;
  const { key, descending } = value as { key?: unknown; descending?: unknown };
  return SORT_KEYS.find((k) => k === key) ? { key: key as SortKey, descending: descending === true } : DEFAULT_SORT;
}

export interface DeckGroup {
  key: string;
  // null for flat sorts, which have no headers.
  label: string | null;
  entries: DeckCardEntry[];
}

const byName = (a: DeckCardEntry, b: DeckCardEntry) => a.card.name.localeCompare(b.card.name);

const COLOR_GROUPS: { key: string; label: string }[] = [
  { key: "W", label: "White" },
  { key: "U", label: "Blue" },
  { key: "B", label: "Black" },
  { key: "R", label: "Red" },
  { key: "G", label: "Green" },
  { key: "multi", label: "Multicolor" },
  { key: "colorless", label: "Colorless" },
  { key: "land", label: "Lands" },
];

function colorGroupOf(entry: DeckCardEntry): string {
  if (primaryTypeCategory(entry.card) === "Land") return "land";
  // A double-faced card has no top-level colors, so fall back to its color identity.
  const colors = entry.card.colors ?? entry.card.color_identity ?? [];
  if (colors.length === 0) return "colorless";
  return colors.length === 1 ? colors[0] : "multi";
}

const MAX_CMC_BUCKET = 7;
function cmcGroupOf(entry: DeckCardEntry): string {
  if (primaryTypeCategory(entry.card) === "Land") return "land";
  return String(Math.min(MAX_CMC_BUCKET, Math.max(0, Math.floor(entry.card.cmc ?? 0))));
}

const HIGHLIGHT_GROUPS = [
  { key: "owned", label: "Owned (yellow)" },
  { key: "missing", label: "Missing (red)" },
  { key: "none", label: "Not highlighted" },
];

// Puts entries under headers in ascending order, with every group sorted by name.
function grouped(entries: DeckCardEntry[], order: { key: string; label: string }[], groupOf: (e: DeckCardEntry) => string): DeckGroup[] {
  const buckets = new Map<string, DeckCardEntry[]>();
  for (const entry of entries) {
    const key = groupOf(entry);
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  }
  const known = new Set(order.map((o) => o.key));
  const groups = order.filter((o) => buckets.has(o.key)).map((o) => ({ key: o.key, label: o.label, entries: [...buckets.get(o.key)!].sort(byName) }));
  // A group nobody listed (a card type we don't know) goes last instead of vanishing.
  for (const [key, list] of buckets) if (!known.has(key)) groups.push({ key, label: key, entries: [...list].sort(byName) });
  return groups;
}

// Unknown values (no price, no ranking) always go last, whichever way the list runs.
function flat(entries: DeckCardEntry[], valueOf: (e: DeckCardEntry) => number | null, descending: boolean): DeckGroup[] {
  const known = entries.filter((e) => valueOf(e) !== null);
  const unknown = entries.filter((e) => valueOf(e) === null).sort(byName);
  const direction = descending ? -1 : 1;
  known.sort((a, b) => direction * ((valueOf(a) as number) - (valueOf(b) as number)) || byName(a, b));
  return [{ key: "all", label: null, entries: [...known, ...unknown] }];
}

export function groupAndSort(entries: DeckCardEntry[], sort: SortState): DeckGroup[] {
  if (entries.length === 0) return [];
  switch (sort.key) {
    case "name": {
      const direction = sort.descending ? -1 : 1;
      return [{ key: "all", label: null, entries: [...entries].sort((a, b) => direction * byName(a, b)) }];
    }
    case "price":
      return flat(entries, (e) => priceValue(e.card), sort.descending);
    case "popularity":
      return flat(entries, (e) => e.card.edhrec_rank ?? null, sort.descending);
    default: {
      const groups =
        sort.key === "type"
          ? grouped(entries, [...TYPE_CATEGORY_ORDER, "Other"].map((c) => ({ key: c, label: c })), (e) => primaryTypeCategory(e.card))
          : sort.key === "cmc"
            ? grouped(
                entries,
                [...Array.from({ length: MAX_CMC_BUCKET + 1 }, (_, i) => ({ key: String(i), label: i === MAX_CMC_BUCKET ? `${i}+ mana` : `${i} mana` })), { key: "land", label: "Lands" }],
                cmcGroupOf
              )
            : sort.key === "color"
              ? grouped(entries, COLOR_GROUPS, colorGroupOf)
              : grouped(entries, HIGHLIGHT_GROUPS, (e) => e.mark ?? "none");
      if (!sort.descending) return groups;
      return [...groups].reverse().map((g) => ({ ...g, entries: [...g.entries].reverse() }));
    }
  }
}
