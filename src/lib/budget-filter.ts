// Splits search results by the Budget setting. Hiding cards is only fair if the person can
// tell it happened, so callers get the hidden ones back too, and a card that was searched
// for by its full name is never hidden: if you type "Rhythm of the Wild" you want that card,
// whatever it costs.

// "Wayfarer's Bauble" / "wayfarers bauble" / "Lim-Dûl's Vault" -> comparable plain text.
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase()
    .replace(/['’`]/g, "") // apostrophes vanish: "wayfarer's" -> "wayfarers"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// True when the query is the card's full name — or one face of a double-faced card ("Fire // Ice").
export function isExactNameMatch(cardName: string, query: string): boolean {
  const wanted = normalizeName(query);
  if (!wanted) return false;
  return normalizeName(cardName) === wanted || cardName.split(" // ").some((face) => normalizeName(face) === wanted);
}

export function splitByBudget<T extends { name: string }>(cards: T[], inBudget: (card: T) => boolean, query = ""): { shown: T[]; hidden: T[] } {
  const exact: T[] = [];
  const shown: T[] = [];
  const hidden: T[] = [];
  for (const card of cards) {
    if (isExactNameMatch(card.name, query)) exact.push(card);
    else if (inBudget(card)) shown.push(card);
    else hidden.push(card);
  }
  // Exact matches go first, so pressing Enter on a typed name adds that very card.
  return { shown: [...exact, ...shown], hidden };
}
