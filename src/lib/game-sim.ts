// A statistical approximation of EDH games — NOT a rules-accurate simulator.
// Building one of those means hand-coding executable behavior for every
// unique card's oracle text, which is the multi-year engineering effort
// behind things like MTG Arena or Forge; it isn't something derivable from
// Scryfall's text data. This instead models each deck as a handful of
// composition stats (already computed elsewhere in this app) and runs a
// simplified, randomized turn-by-turn accumulation model. Treat the result
// as a rough, clearly-labeled estimate for comparing deck changes against
// itself — not a claim about real game outcomes.

export interface DeckProfile {
  label: string;
  ramp: number;
  removal: number;
  wipes: number;
  draw: number;
  tutors: number;
  counterspells: number;
  avgCmc: number;
  gameChangers: number;
  landCount: number;
}

export const BRACKETS = [
  { value: 1, label: "Bracket 1 — Exhibition" },
  { value: 2, label: "Bracket 2 — Core" },
  { value: 3, label: "Bracket 3 — Upgraded" },
  { value: 4, label: "Bracket 4 — Optimized" },
  { value: 5, label: "Bracket 5 — cEDH" },
] as const;

// Rough, community-informed rules-of-thumb for what a deck at each bracket
// tends to look like — not sourced from a real dataset, just the same kind
// of heuristic the rest of this app's rule-of-thumb targets already use.
const BRACKET_BASELINES: Record<number, Omit<DeckProfile, "label">> = {
  1: { ramp: 6, removal: 5, wipes: 1, draw: 5, tutors: 0, counterspells: 0, avgCmc: 3.6, gameChangers: 0, landCount: 38 },
  2: { ramp: 8, removal: 7, wipes: 2, draw: 7, tutors: 1, counterspells: 1, avgCmc: 3.2, gameChangers: 0, landCount: 37 },
  3: { ramp: 10, removal: 9, wipes: 2, draw: 9, tutors: 2, counterspells: 2, avgCmc: 2.9, gameChangers: 1, landCount: 37 },
  4: { ramp: 11, removal: 10, wipes: 3, draw: 10, tutors: 3, counterspells: 3, avgCmc: 2.5, gameChangers: 4, landCount: 36 },
  5: { ramp: 12, removal: 10, wipes: 2, draw: 11, tutors: 5, counterspells: 4, avgCmc: 2.1, gameChangers: 7, landCount: 35 },
};

export function averageCmc(curve: Record<string, number>): number {
  let totalCmc = 0;
  let totalCount = 0;
  for (const [bucket, count] of Object.entries(curve)) {
    const cmc = bucket === "6+" ? 7 : Number(bucket);
    totalCmc += cmc * count;
    totalCount += count;
  }
  return totalCount > 0 ? totalCmc / totalCount : 3.5;
}

// A deck built to 30 cards can't have 8 ramp spells yet even if its *shape*
// is just as ramp-heavy as a finished one — comparing raw counts against a
// full-decklist baseline unfairly tanks any deck still under construction.
// This projects "if you kept building at the same ratio" rates instead, so
// the simulation reflects deck shape rather than deck completeness. Capped
// so a two-card deck with one ramp spell doesn't get extrapolated into
// nonsense.
const MAX_PROJECTION_SCALE = 3;

export function projectionScale(nonlandCount: number, nonlandTarget: number): number {
  if (nonlandCount <= 0) return 1;
  return Math.min(MAX_PROJECTION_SCALE, nonlandTarget / nonlandCount);
}

export function bracketBaseline(bracket: number): DeckProfile {
  const baseline = BRACKET_BASELINES[bracket] ?? BRACKET_BASELINES[3];
  return { label: `Bracket ${bracket} baseline`, ...baseline };
}

function jitter(value: number, spread = 0.25): number {
  const factor = 1 + (Math.random() * 2 - 1) * spread;
  return Math.max(0, value * factor);
}

export function generateOpponents(bracket: number, count = 3): DeckProfile[] {
  const baseline = BRACKET_BASELINES[bracket] ?? BRACKET_BASELINES[3];
  return Array.from({ length: count }, (_, i) => ({
    label: `Opponent ${i + 1}`,
    ramp: Math.round(jitter(baseline.ramp)),
    removal: Math.round(jitter(baseline.removal)),
    wipes: Math.round(jitter(baseline.wipes)),
    draw: Math.round(jitter(baseline.draw)),
    tutors: Math.round(jitter(baseline.tutors)),
    counterspells: Math.round(jitter(baseline.counterspells)),
    avgCmc: Math.round(jitter(baseline.avgCmc, 0.15) * 10) / 10,
    gameChangers: Math.round(jitter(baseline.gameChangers, 0.4)),
    landCount: Math.round(jitter(baseline.landCount, 0.08)),
  }));
}

const ROUNDS = 10;
const FORM_SPREAD = 2.9;
const TYPICAL_DEVELOPMENT = 2.3;
const COMBO_START_ROUND = 3;
const COMBO_CHANCE_CAP = 0.25;
const COMBO_DIVISOR = 200;
const COMBO_REMOVAL_DIVISOR = 90;
const REMOVAL_DIVISOR = 40;
const REMOVAL_DAMAGE = 0.75;
const WIPE_DIVISOR = 28;
const WIPE_DAMAGE = 1;

function gaussianLike(): number {
  // Average of 3 uniforms approximates a bell curve without needing a real
  // Box-Muller transform — plenty good enough for this heuristic's purpose.
  return (Math.random() + Math.random() + Math.random()) / 3;
}

// A land count far from the ~37 sweet spot makes a deck less reliable:
// too few risks getting stuck under curve, too many thins out action density.
function manaConsistency(landCount: number): number {
  if (landCount < 30) return 0.8;
  if (landCount < 33) return 0.92;
  if (landCount <= 41) return 1;
  if (landCount <= 45) return 0.95;
  return 0.88;
}

// Plays one simplified "game": each player gets a per-game "form" roll (mana
// screw, flood, mulligans — real Commander has huge game-to-game variance, so
// deck shape tilts the odds rather than deciding them), then each round every
// profile develops board presence (faster with more ramp, a lower curve, and a
// healthier mana base), gains a trickle of value from card draw, and from turn
// three onward has a combo/finisher chance that grows with game-changer and
// tutor density and with how fast they've been developing. Counterspells and
// removal in other players' decks can break a combo up, and removal/wipes
// occasionally set back whoever is ahead. Returns the winning profile's index.
function simulateGame(profiles: DeckProfile[]): number {
  const form = profiles.map(() => Math.max(0.2, 1 + (gaussianLike() - 0.5) * FORM_SPREAD));
  const score = profiles.map(() => 0);

  for (let round = 1; round <= ROUNDS; round++) {
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const development = (1 + p.ramp / 12) * (3.5 / Math.max(1, p.avgCmc)) * manaConsistency(p.landCount) * form[i] * (0.6 + gaussianLike());
      score[i] += development + (p.draw / 12) * Math.random();

      if (round >= COMBO_START_ROUND) {
        const tempo = Math.min(1.5, development / TYPICAL_DEVELOPMENT);
        const comboChance = Math.min(COMBO_CHANCE_CAP, ((p.gameChangers * 2 + p.tutors) / COMBO_DIVISOR) * tempo);
        if (Math.random() < comboChance) {
          const disrupted = profiles.some((o, j) => j !== i && (Math.random() < o.counterspells / 15 || Math.random() < o.removal / COMBO_REMOVAL_DIVISOR));
          if (!disrupted) return i;
        }
      }
    }

    // Interaction pass: each player may snipe the current leader or wipe the board.
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      if (Math.random() < p.removal / REMOVAL_DIVISOR) {
        let leader = -1;
        for (let j = 0; j < profiles.length; j++) if (j !== i && (leader === -1 || score[j] > score[leader])) leader = j;
        if (leader !== -1) score[leader] = Math.max(0, score[leader] - REMOVAL_DAMAGE);
      }
      if (Math.random() < p.wipes / WIPE_DIVISOR) {
        for (let j = 0; j < profiles.length; j++) if (j !== i) score[j] = Math.max(0, score[j] - WIPE_DAMAGE);
      }
    }
  }

  let winner = 0;
  for (let i = 1; i < score.length; i++) if (score[i] > score[winner]) winner = i;
  return winner;
}

export interface WeakSpot {
  key: "ramp" | "removal" | "wipes" | "draw" | "tutors" | "counterspells";
  label: string;
  userValue: number;
  benchmark: number;
}

export interface SimulationResult {
  bracket: number;
  // The first SAMPLE_GAMES of the simulated games, shown as cards in the UI.
  games: number;
  wins: number;
  losses: number;
  gameResults: boolean[];
  // Win rate over ESTIMATE_GAMES simulated games — stable run to run, unlike
  // the handful of sample games, which swing wildly by luck alone.
  winRate: number;
  estimateGames: number;
  marginOfError: number;
  // Estimated win rate if the listed weak spots were raised to bracket-typical
  // levels; undefined when there are none.
  winRateIfFixed?: number;
  userProfile: DeckProfile;
  opponents: DeckProfile[];
  weakSpots: WeakSpot[];
  projectionScale: number;
}

const SAMPLE_GAMES = 10;
const ESTIMATE_GAMES = 4000;

function estimateWinRate(profile: DeckProfile, bracket: number, games: number, sample?: boolean[]): number {
  let wins = 0;
  for (let g = 0; g < games; g++) {
    const won = simulateGame([profile, ...generateOpponents(bracket)]) === 0;
    if (won) wins++;
    if (sample && sample.length < SAMPLE_GAMES) sample.push(won);
  }
  return wins / games;
}

export function runSimulation(userProfile: DeckProfile, bracket: number, scale = 1): SimulationResult {
  const gameResults: boolean[] = [];
  const winRate = estimateWinRate(userProfile, bracket, ESTIMATE_GAMES, gameResults);
  const wins = gameResults.filter(Boolean).length;

  const baseline = bracketBaseline(bracket);
  const dims: { key: WeakSpot["key"]; label: string }[] = [
    { key: "ramp", label: "Ramp" },
    { key: "removal", label: "Spot removal" },
    { key: "wipes", label: "Board wipes" },
    { key: "draw", label: "Card draw" },
    { key: "tutors", label: "Tutors" },
    { key: "counterspells", label: "Counterspells" },
  ];
  const deficit = (d: WeakSpot) => d.userValue - d.benchmark;
  const weakSpots = dims
    .map((d) => ({ key: d.key, label: d.label, userValue: userProfile[d.key], benchmark: baseline[d.key] }))
    .filter((d) => d.userValue < d.benchmark - 1)
    .sort((a, b) => deficit(a) - deficit(b))
    .slice(0, 2);

  let winRateIfFixed: number | undefined;
  if (weakSpots.length > 0) {
    const fixed: DeckProfile = { ...userProfile };
    for (const spot of weakSpots) fixed[spot.key] = spot.benchmark;
    winRateIfFixed = estimateWinRate(fixed, bracket, ESTIMATE_GAMES);
  }

  return {
    bracket,
    games: SAMPLE_GAMES,
    wins,
    losses: SAMPLE_GAMES - wins,
    gameResults,
    winRate,
    estimateGames: ESTIMATE_GAMES,
    marginOfError: 1.96 * Math.sqrt((winRate * (1 - winRate)) / ESTIMATE_GAMES),
    winRateIfFixed,
    userProfile,
    opponents: [{ ...baseline, label: `Bracket ${bracket} typical` }],
    weakSpots,
    projectionScale: scale,
  };
}
