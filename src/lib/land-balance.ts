import type { ScryfallCard } from "./scryfall-types";
import { cardOracleText, isBasicLand } from "./card-helpers";
import { TARGET_LAND_COUNT } from "./deck-analysis";
import { countColorSymbols } from "./land-fill";

interface Entry {
  card: ScryfallCard;
  quantity: number;
}

export interface ColorBalance {
  color: string;
  pips: number;
  share: number;
  sources: number;
  target: number;
  deficit: number;
}

export interface LandBalance {
  colors: ColorBalance[];
  landCount: number;
  landTarget: number;
}

const BASIC_TYPE_COLOR: Record<string, string> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

export const isLand = (card: Pick<ScryfallCard, "type_line">) => (card.type_line ?? "").includes("Land");

// Which of the deck's colors a land can actually produce. Fetch lands have no
// `produced_mana` in Scryfall's data, so read the basic land types they search
// for; "any basic land" fetchers (Evolving Wilds) count for every color but at
// reduced weight, since they're slow.
export function landColors(card: ScryfallCard, deckColors: string[]): { colors: string[]; weight: number } {
  const produced = (card.produced_mana ?? []).filter((c) => deckColors.includes(c));
  if (produced.length > 0) return { colors: produced, weight: 1 };

  const text = cardOracleText(card);
  const search = text.match(/search your library for (?:a|an|up to \w+) ([^.]*?)card/i);
  if (search) {
    const typed = Object.keys(BASIC_TYPE_COLOR).filter((t) => search[1].includes(t)).map((t) => BASIC_TYPE_COLOR[t]);
    const colors = typed.filter((c) => deckColors.includes(c));
    if (colors.length > 0) return { colors, weight: 1 };
    if (/basic land/i.test(search[1])) return { colors: [...deckColors], weight: 0.6 };
  }
  return { colors: [], weight: 0 };
}

// Mana that can only be spent on some spells, or that costs life, is worse
// fixing than it looks on paper.
function manaDrawbackPenalty(card: ScryfallCard): number {
  const text = cardOracleText(card);
  let penalty = 0;
  if (/spend this mana only/i.test(text)) penalty += 3;
  if (/\{T\}, (?:exile|remove|sacrifice|discard)/i.test(text)) penalty += 3;
  // Colored mana that only works if the land started in your opening hand
  // (Gemstone Caverns), i.e. colorless in most games.
  if (/opening hand|instead add/i.test(text)) penalty += 3;
  if (/deals? \d+ damage to you|pay \d+ life/i.test(text) && !/you may pay/i.test(text)) penalty += 1.5;
  return penalty;
}

export function entersTapped(card: ScryfallCard): boolean {
  const text = cardOracleText(card);
  return /enters (?:the battlefield )?tapped/i.test(text) && !/unless|if you|if an opponent|you may pay/i.test(text);
}

// Rule-of-thumb sources a color needs in a 37-land Commander deck, scaling
// with how much of the deck's mana symbols it accounts for (roughly 19 sources
// for a minor color up to the mid-30s for a deck's only color).
function targetSources(share: number, landTarget: number): number {
  return Math.min(landTarget, Math.round(15 + 20 * share));
}

export function computeLandBalance(commanders: Entry[], mainboard: Entry[], colorIdentity: string[]): LandBalance {
  const deckColors = colorIdentity.filter((c) => "WUBRG".includes(c));
  const spells = [...commanders, ...mainboard].filter((e) => !isLand(e.card));
  const pipCounts = countColorSymbols(spells.flatMap((e) => Array(e.quantity).fill(e.card)));
  const totalPips = deckColors.reduce((sum, c) => sum + pipCounts[c], 0);

  const lands = mainboard.filter((e) => isLand(e.card));
  const landCount = lands.reduce((sum, e) => sum + e.quantity, 0);

  const colors = deckColors.map((color): ColorBalance => {
    const pips = pipCounts[color];
    const share = totalPips > 0 ? pips / totalPips : 1 / deckColors.length;
    let sources = 0;
    for (const { card, quantity } of lands) {
      const { colors: produced, weight } = landColors(card, deckColors);
      if (produced.includes(color)) sources += quantity * weight;
    }
    sources = Math.round(sources * 10) / 10;
    const target = targetSources(share, TARGET_LAND_COUNT);
    return { color, pips, share, sources, target, deficit: Math.max(0, Math.round((target - sources) * 10) / 10) };
  });

  return { colors, landCount, landTarget: TARGET_LAND_COUNT };
}

// Higher is a better pick: favors lands that produce the colors the deck is
// shortest on, then popularity (EDHREC rank, 1 = most played), and docks lands
// that always enter tapped.
export function scoreLand(card: ScryfallCard, balance: LandBalance): number {
  const deckColors = balance.colors.map((c) => c.color);
  const { colors: produced, weight } = landColors(card, deckColors);
  const drawback = manaDrawbackPenalty(card);
  // Mana that is restricted or gated behind an extra cost fixes far less than
  // its color count suggests, so discount the fixing value, not just the score.
  const reliability = drawback >= 3 ? 0.35 : 1;
  const fix = produced.reduce((sum, c) => sum + (balance.colors.find((b) => b.color === c)?.deficit ?? 0), 0) * weight * reliability;
  const popularity = card.edhrec_rank ? Math.max(0, 1 - Math.log10(card.edhrec_rank) / 4.2) : 0.2;
  return fix + popularity * 5 - (entersTapped(card) ? 2 : 0) - drawback;
}

// The basic to swap out when a nonbasic comes in: the one whose color the deck
// has the most surplus sources of.
export function basicToRemove(basics: Entry[], balance: LandBalance): Entry | undefined {
  const surplus = (card: ScryfallCard) => {
    const color = card.produced_mana?.[0];
    const b = balance.colors.find((c) => c.color === color);
    return b ? b.sources - b.target : -Infinity;
  };
  return [...basics].filter((e) => e.quantity > 0).sort((a, b) => surplus(b.card) - surplus(a.card) || b.quantity - a.quantity)[0];
}

export const isRemovableBasic = (card: ScryfallCard) => isBasicLand(card) && !/wastes/i.test(card.name);
