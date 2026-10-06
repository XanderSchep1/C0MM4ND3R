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

// Plays one simplified "game": each round, every profile develops board
// presence (faster with more ramp, a lower curve, and a healthier mana base),
// gains a trickle of value from card draw, occasionally snipes the current
// leader (removal) or resets the field (wipes), and has a combo/finisher
// chance that grows each round with game-changer and tutor density —
// unless another player's counterspell density breaks it up. Returns the
// winning profile's index.
function simulateGame(profiles: DeckProfile[]): number {
  const score = profiles.map(() => 0);

  for (let round = 1; round <= ROUNDS; round++) {
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const development = (1 + p.ramp / 12) * (3.5 / Math.max(1, p.avgCmc)) * manaConsistency(p.landCount) * (0.6 + gaussianLike());
      score[i] += development + (p.draw / 12) * Math.random();

      const comboChance = Math.min(0.35, ((p.gameChangers * 2 + p.tutors) / 100) * round);
      if (Math.random() < comboChance) {
        const interceptors = profiles.filter((_, j) => j !== i);
        const countered = interceptors.some((o) => Math.random() < o.counterspells / 15);
        if (!countered) return i;
      }
    }

    // Interaction pass: each player may snipe the current leader or wipe the board.
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      if (Math.random() < p.removal / 20) {
        let leader = 0;
        for (let j = 1; j < profiles.length; j++) if (j !== i && score[j] > score[leader]) leader = j;
        if (leader !== i) score[leader] = Math.max(0, score[leader] - 1);
      }
      if (Math.random() < p.wipes / 20) {
        for (let j = 0; j < profiles.length; j++) if (j !== i) score[j] = Math.max(0, score[j] - 1.5);
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
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  gameResults: boolean[];
  userProfile: DeckProfile;
  opponents: DeckProfile[];
  weakSpots: WeakSpot[];
  projectionScale: number;
}

const GAMES = 10;

export function runSimulation(userProfile: DeckProfile, bracket: number, scale = 1): SimulationResult {
  let wins = 0;
  const gameResults: boolean[] = [];
  const opponentSets: DeckProfile[][] = [];
  for (let g = 0; g < GAMES; g++) {
    const opponents = generateOpponents(bracket);
    opponentSets.push(opponents);
    const winner = simulateGame([userProfile, ...opponents]);
    const won = winner === 0;
    gameResults.push(won);
    if (won) wins++;
  }

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

  return {
    bracket,
    games: GAMES,
    wins,
    losses: GAMES - wins,
    winRate: wins / GAMES,
    gameResults,
    userProfile,
    opponents: opponentSets[opponentSets.length - 1],
    weakSpots,
    projectionScale: scale,
  };
}
