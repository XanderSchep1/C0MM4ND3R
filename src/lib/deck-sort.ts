import { priceValue, primaryTypeCategory, TYPE_CATEGORY_ORDER } from "./card-helpers";
import type { DeckCardEntry } from "./commander";

// How the deck list is ordered, in two levels. The main sort decides the headers ("grouped" sorts:
// Creature, Sorcery… / 1, 2, 3 mana / White, Blue…) or one long list ("flat" sorts: name, price,
// popularity). The second sort, "then by", orders the cards inside each group — or breaks ties in a
// flat list. So "Card type, then Mana value" is every type heading with its cards cheapest-first.

export const SORT_KEYS = ["type", "cmc", "name", "price", "color", "highlight", "popularity"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface SortState {
  key: SortKey;
  descending: boolean;
  // The order inside each group (and the tie-breaker for flat sorts). Never the same as `key`.
  then: SortKey;
  thenDescending: boolean;
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

export const DEFAULT_SORT: SortState = { key: "type", descending: false, then: "name", thenDescending: false };

// Price starts with the dearest card at the top; everything else starts in its natural order.
const naturalDescending = (key: SortKey) => key === "price";

export function directionLabel(key: SortKey, descending: boolean): string {
  return DIRECTION_LABELS[key][descending ? 1 : 0];
}

// What the second sort becomes when it would collide with the main one.
const fallbackThen = (key: SortKey): SortKey => (key === "name" ? "cmc" : "name");

export function withPrimary(state: SortState, key: SortKey): SortState {
  const then = state.then === key ? fallbackThen(key) : state.then;
  return { key, descending: naturalDescending(key), then, thenDescending: then === state.then ? state.thenDescending : naturalDescending(then) };
}

export function withSecondary(state: SortState, then: SortKey): SortState {
  if (then === state.key) return state;
  return { ...state, then, thenDescending: naturalDescending(then) };
}

// Anything unexpected (old or hand-edited saved settings) falls back to the default. Settings saved
// before the second sort existed carry only `key` and `descending`, and still load.
export function parseSort(value: unknown): SortState {
  if (typeof value !== "object" || value === null) return DEFAULT_SORT;
  const saved = value as { key?: unknown; descending?: unknown; then?: unknown; thenDescending?: unknown };
  const key = SORT_KEYS.find((k) => k === saved.key);
  if (!key) return DEFAULT_SORT;
  const then = SORT_KEYS.find((k) => k === saved.then && k !== key) ?? fallbackThen(key);
  return { key, descending: saved.descending === true, then, thenDescending: saved.thenDescending === true };
}

export interface DeckGroup {
  key: string;
  // null for flat sorts, which have no headers.
  label: string | null;
  entries: DeckCardEntry[];
}

type Compare = (a: DeckCardEntry, b: DeckCardEntry) => number;

const byName: Compare = (a, b) => a.card.name.localeCompare(b.card.name);

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

const CATEGORY_ORDER: string[] = [...TYPE_CATEGORY_ORDER, "Other"];
const rankIn = (order: string[], key: string) => {
  const i = order.indexOf(key);
  return i === -1 ? order.length : i;
};

// The number a card is ordered by for each sort, or null when it has none (no price, no ranking).
function numberFor(key: Exclude<SortKey, "name">, entry: DeckCardEntry): number | null {
  switch (key) {
    case "type":
      return rankIn(CATEGORY_ORDER, primaryTypeCategory(entry.card));
    case "cmc":
      return entry.card.cmc ?? 0;
    case "price":
      return priceValue(entry.card);
    case "color":
      return rankIn(COLOR_GROUPS.map((g) => g.key), colorGroupOf(entry));
    case "highlight":
      return rankIn(HIGHLIGHT_GROUPS.map((g) => g.key), entry.mark ?? "none");
    case "popularity":
      return entry.card.edhrec_rank ?? null;
  }
}

// Cards with no value (no price, no ranking) always go last, whichever way the list runs.
function comparator(key: SortKey, descending: boolean): Compare {
  const direction = descending ? -1 : 1;
  if (key === "name") return (a, b) => direction * byName(a, b);
  return (a, b) => {
    const x = numberFor(key, a);
    const y = numberFor(key, b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return direction * (x - y);
  };
}

// Tries each comparison in turn; the name settles whatever is left, so the order is never random.
const chain = (...compares: Compare[]): Compare => (a, b) => {
  for (const compare of compares) {
    const result = compare(a, b);
    if (result !== 0) return result;
  }
  return byName(a, b);
};

// Puts entries under headers in ascending order; each group is then ordered by `inside`.
function grouped(entries: DeckCardEntry[], order: { key: string; label: string }[], groupOf: (e: DeckCardEntry) => string, inside: Compare): DeckGroup[] {
  const buckets = new Map<string, DeckCardEntry[]>();
  for (const entry of entries) {
    const key = groupOf(entry);
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  }
  const known = new Set(order.map((o) => o.key));
  const groups = order.filter((o) => buckets.has(o.key)).map((o) => ({ key: o.key, label: o.label, entries: [...buckets.get(o.key)!].sort(inside) }));
  // A group nobody listed (a card type we don't know) goes last instead of vanishing.
  for (const [key, list] of buckets) if (!known.has(key)) groups.push({ key, label: key, entries: [...list].sort(inside) });
  return groups;
}

export function groupAndSort(entries: DeckCardEntry[], sort: SortState): DeckGroup[] {
  if (entries.length === 0) return [];
  const inside = chain(comparator(sort.then, sort.thenDescending));

  // Flat sorts: one list, ordered by the main sort, then the second, then by name.
  if (sort.key === "name" || sort.key === "price" || sort.key === "popularity") {
    return [{ key: "all", label: null, entries: [...entries].sort(chain(comparator(sort.key, sort.descending), comparator(sort.then, sort.thenDescending))) }];
  }

  // Grouped sorts: the main sort orders the headings (reversed when descending); the second orders each group.
  const groups =
    sort.key === "type"
      ? grouped(entries, CATEGORY_ORDER.map((c) => ({ key: c, label: c })), (e) => primaryTypeCategory(e.card), inside)
      : sort.key === "cmc"
        ? grouped(
            entries,
            [...Array.from({ length: MAX_CMC_BUCKET + 1 }, (_, i) => ({ key: String(i), label: i === MAX_CMC_BUCKET ? `${i}+ mana` : `${i} mana` })), { key: "land", label: "Lands" }],
            cmcGroupOf,
            inside
          )
        : sort.key === "color"
          ? grouped(entries, COLOR_GROUPS, colorGroupOf, inside)
          : grouped(entries, HIGHLIGHT_GROUPS, (e) => e.mark ?? "none", inside);
  return sort.descending ? [...groups].reverse() : groups;
}
