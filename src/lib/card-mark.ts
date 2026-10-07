// The owner's own highlight on a deck line, to track which cards they physically
// have. It's private to the deck's owner: shared (public) deck pages never get it.
export const CARD_MARKS = ["owned", "missing"] as const;
export type CardMark = (typeof CARD_MARKS)[number];

// A stored value → a mark, ignoring anything unexpected.
export function toMark(value: unknown): CardMark | null {
  return CARD_MARKS.find((m) => m === value) ?? null;
}

// A request value → a mark, `null` to clear it, or `undefined` when it isn't valid.
export function parseMarkInput(value: unknown): CardMark | null | undefined {
  if (value === null) return null;
  return CARD_MARKS.find((m) => m === value);
}
