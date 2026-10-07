// Page arithmetic for the suggestions "book": a long list shown a few cards per page.

export const CARDS_PER_PAGE = 6;

export function pageCount(total: number, perPage = CARDS_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

// Keeps a page number valid when the list shrinks (e.g. after a card is added and leaves the book).
export function clampPage(page: number, total: number, perPage = CARDS_PER_PAGE): number {
  return Math.min(pageCount(total, perPage) - 1, Math.max(0, Math.floor(page) || 0));
}

export function pageSlice<T>(items: T[], page: number, perPage = CARDS_PER_PAGE): T[] {
  const start = clampPage(page, items.length, perPage) * perPage;
  return items.slice(start, start + perPage);
}

// 1-based, inclusive: page 2 of 40 cards at 6 per page -> 7 to 12. An empty list gives 0 to 0.
export function pageRange(page: number, total: number, perPage = CARDS_PER_PAGE): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const start = clampPage(page, total, perPage) * perPage;
  return { from: start + 1, to: Math.min(total, start + perPage) };
}
