import { searchAndCacheCards } from "./cards";
import type { ScryfallCard } from "./scryfall-types";
import type { DeckAnalysis } from "./deck-analysis";

export interface SuggestionGroup {
  key: string;
  label: string;
  reason: string;
  cards: ScryfallCard[];
}

const MAX_THEMES = 4;
const CARDS_PER_THEME = 8;

function identityClause(colorIdentity: string[]): string {
  return `id<=${colorIdentity.length ? colorIdentity.join("") : "c"}`;
}

function baseClause(colorIdentity: string[]): string {
  // -is:funny keeps out Un-set jokes; legality is double-checked against the
  // deck's actual color identity when the suggestions render.
  return `${identityClause(colorIdentity)} f:commander -is:funny game:paper`;
}

async function fetchTheme(colorIdentity: string[], clause: string, exclude: Set<string>): Promise<ScryfallCard[]> {
  const { cards } = await searchAndCacheCards(`${baseClause(colorIdentity)} ${clause}`, {
    order: "edhrec",
    unique: "cards",
  });
  return cards.filter((c) => !exclude.has(c.name.toLowerCase())).slice(0, CARDS_PER_THEME);
}

// The Scryfall client already serializes actual HTTP calls through its own
// rate-limit queue (see scryfall.ts), so kicking these off together rather
// than one-at-a-time doesn't risk 429s — it just lets each theme's cache
// upsert overlap with the next theme's network wait, which is most of the
// wall-clock cost with a cold DB connection.
export async function suggestForGaps(analysis: DeckAnalysis, colorIdentity: string[], excludeNames: Set<string>): Promise<SuggestionGroup[]> {
  const exclude = new Set([...excludeNames].map((n) => n.toLowerCase()));
  const deficientThemes = analysis.themes.filter((t) => t.deficit > 0).slice(0, MAX_THEMES);

  const themeResults = await Promise.all(
    deficientThemes.map(async (theme) => {
      const cards = await fetchTheme(colorIdentity, theme.scryfallClause, exclude);
      return cards.length > 0
        ? {
            key: theme.key,
            label: theme.label,
            reason: `You have ${theme.count}/${theme.target} — popular ${theme.label.toLowerCase()} in your colors.`,
            cards,
          }
        : null;
    })
  );

  const landGroup = analysis.landDeficit > 0
    ? fetchTheme(colorIdentity, "t:land -is:basic", exclude).then((cards) =>
        cards.length > 0
          ? {
              key: "lands",
              label: "Lands",
              reason: `You have ${analysis.landCount}/${analysis.landTarget} lands — consider adding nonbasics that fix or ramp your mana.`,
              cards,
            }
          : null
      )
    : Promise.resolve(null);

  const groups = [...themeResults, await landGroup];
  return groups.filter((g): g is SuggestionGroup => g !== null);
}
