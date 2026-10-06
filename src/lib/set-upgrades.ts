import type { ScryfallCard } from "./scryfall-types";
import { isBasicLand, primaryTypeCategory } from "./card-helpers";
import { THEMES } from "./deck-analysis";
import { cardMatchesSignal, detectSynergySignals } from "./synergy";
import { searchAndCacheCards } from "./cards";

export interface UpgradeSuggestion {
  card: ScryfallCard;
  kind: "role" | "synergy";
  label: string;
  reason: string;
  replaces?: ScryfallCard;
}

interface Entry {
  card: ScryfallCard;
  quantity: number;
}

const CANDIDATES_PER_KIND = 4;
// Cap new cards and reprints separately, otherwise a handful of proven
// reprints (Sol Ring, Swords...) would crowd out every brand-new card.
const MAX_PER_KIND = 15;
// A nonbasic land has to be reasonably proven (or a clear multi-color fixer)
// to be worth replacing a basic with.
const MAX_LAND_RANK = 1500;
const UNRANKED = Number.MAX_SAFE_INTEGER;

// EDHREC rank: lower is more popular. Cards from a just-released set often
// have none yet, so "unranked" has to be treated as unknown, not as "bad".
const rank = (c: ScryfallCard) => c.edhrec_rank ?? UNRANKED;
const worstFirst = (a: ScryfallCard, b: ScryfallCard) => rank(b) - rank(a);

// Evidence-based "is this strictly better at the same job" check: either far
// more played, or meaningfully cheaper without being much less played.
function improvementReason(candidate: ScryfallCard, existing: ScryfallCard): string | null {
  if (candidate.edhrec_rank !== undefined && rank(existing) > candidate.edhrec_rank * 2) {
    const theirs = existing.edhrec_rank !== undefined ? `#${existing.edhrec_rank}` : "unranked";
    return `Far more popular than ${existing.name} (EDHREC #${candidate.edhrec_rank} vs ${theirs}).`;
  }
  const cheaperBy = existing.cmc - candidate.cmc;
  if (cheaperBy >= 1 && (rank(candidate) <= rank(existing) || cheaperBy >= 2)) {
    return `Cheaper than ${existing.name} (${candidate.cmc} vs ${existing.cmc} mana) for the same job.`;
  }
  return null;
}

const isLand = (c: ScryfallCard) => primaryTypeCategory(c) === "Land";

async function fetchFromSets(
  setClause: string,
  base: string,
  clause: string,
  exclude: Set<string>,
  keep: (c: ScryfallCard) => boolean = (c) => !isLand(c)
): Promise<ScryfallCard[]> {
  const { cards } = await searchAndCacheCards(`${base} ${setClause} ${clause}`, { order: "edhrec", unique: "cards" });
  const usable = cards.filter((c) => !exclude.has(c.name.toLowerCase()) && keep(c));
  return [...usable.filter((c) => !c.reprint).slice(0, CANDIDATES_PER_KIND), ...usable.filter((c) => c.reprint).slice(0, CANDIDATES_PER_KIND)];
}

export async function findUpgrades(opts: {
  commanders: Entry[];
  mainboard: Entry[];
  maybeboard: Entry[];
  colorIdentity: string[];
  setCodes: string[];
}): Promise<UpgradeSuggestion[]> {
  const { commanders, mainboard, maybeboard, colorIdentity, setCodes } = opts;
  if (setCodes.length === 0) return [];

  const exclude = new Set([...commanders, ...mainboard, ...maybeboard].map((e) => e.card.name.toLowerCase()));
  const setClause = `(${setCodes.map((c) => `e:${c}`).join(" or ")})`;
  const base = `id<=${colorIdentity.length ? colorIdentity.join("") : "c"} f:commander -is:funny game:paper`;
  const deckCards = mainboard.map((e) => e.card).filter((c) => !isLand(c));
  const basics = mainboard.filter((e) => isBasicLand(e.card));

  const signals = detectSynergySignals(commanders, mainboard);
  const roleFetches = THEMES.map((theme) => fetchFromSets(setClause, base, theme.scryfallClause, exclude));
  const signalFetches = signals.map((signal) => fetchFromSets(setClause, base, signal.scryfallClause, exclude));
  const landFetch = fetchFromSets(setClause, base, "t:land -is:basic", exclude, (c) => isLand(c) && (c.edhrec_rank !== undefined ? c.edhrec_rank <= MAX_LAND_RANK : (c.produced_mana?.length ?? 0) >= 2));
  const [roleResults, signalResults, landResults] = await Promise.all([Promise.all(roleFetches), Promise.all(signalFetches), landFetch]);

  const suggestions: UpgradeSuggestion[] = [];
  const suggested = new Set<string>();
  const replaced = new Set<string>();

  THEMES.forEach((theme, i) => {
    const inTheme = deckCards.filter((c) => theme.test(c)).sort(worstFirst);
    let gapsToFill = Math.max(0, theme.target - inTheme.length);
    for (const candidate of roleResults[i]) {
      // Scryfall's function tags are looser than the local classifier that
      // counts the deck (e.g. land-fetch spells carry the tutor tag), so a
      // candidate has to pass the same test its category is counted with.
      if (suggested.has(candidate.id) || !theme.test(candidate)) continue;
      if (gapsToFill > 0) {
        gapsToFill--;
        suggested.add(candidate.id);
        suggestions.push({
          card: candidate,
          kind: "role",
          label: theme.label,
          reason: `Fills a gap — your deck has ${inTheme.length}/${theme.target} ${theme.label.toLowerCase()}.`,
        });
        continue;
      }
      for (const existing of inTheme) {
        if (replaced.has(existing.id)) continue;
        const reason = improvementReason(candidate, existing);
        if (!reason) continue;
        replaced.add(existing.id);
        suggested.add(candidate.id);
        suggestions.push({ card: candidate, kind: "role", label: theme.label, reason, replaces: existing });
        break;
      }
    }
  });

  // Cards that fill no role and support none of the deck's detected plans are
  // the natural cuts for a synergy upgrade.
  const filler = deckCards
    .filter((c) => !THEMES.some((t) => t.test(c)) && !signals.some((s) => cardMatchesSignal(c, s)))
    .sort(worstFirst);

  signals.forEach((signal, i) => {
    for (const candidate of signalResults[i]) {
      if (suggested.has(candidate.id)) continue;
      const cut = filler.find((c) => !replaced.has(c.id));
      suggested.add(candidate.id);
      if (cut) replaced.add(cut.id);
      suggestions.push({
        card: candidate,
        kind: "synergy",
        label: signal.label,
        reason: cut
          ? `Supports your ${signal.label.toLowerCase()} plan; ${cut.name} doesn't support any detected plan.`
          : `Supports your ${signal.label.toLowerCase()} plan.`,
        replaces: cut,
      });
    }
  });

  // Nonbasic lands swap for basics only — never for spells — so the land
  // count (and the deck's mana balance) stays put.
  const basicsLeft = new Map(basics.map((e) => [e.card.id, e.quantity]));
  for (const candidate of landResults) {
    const produced = candidate.produced_mana ?? [];
    const options = [...basics].filter((e) => (basicsLeft.get(e.card.id) ?? 0) > 1).sort((a, b) => b.quantity - a.quantity);
    const basic = options.find((e) => (e.card.produced_mana ?? []).some((m) => produced.includes(m))) ?? options[0];
    if (!basic) break;
    basicsLeft.set(basic.card.id, (basicsLeft.get(basic.card.id) ?? 0) - 1);
    suggestions.push({
      card: candidate,
      kind: "role",
      label: "Lands",
      reason: `Better mana than a basic — swap for one of your ${basic.quantity} ${basic.card.name}.`,
      replaces: basic.card,
    });
  }

  const byRank = suggestions.sort((a, b) => rank(a.card) - rank(b.card));
  return [...byRank.filter((s) => !s.card.reprint).slice(0, MAX_PER_KIND), ...byRank.filter((s) => s.card.reprint).slice(0, MAX_PER_KIND)].sort(
    (a, b) => rank(a.card) - rank(b.card)
  );
}
