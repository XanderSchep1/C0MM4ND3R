"use client";

import { useEffect, useState } from "react";
import { CardTile } from "./card-tile";
import { BRACKETS } from "./types";
import type { ScryfallCard, DeckZone, SimulationResult, SuggestionGroup } from "./types";

interface Props {
  deckId: string;
  hasCommander: boolean;
  onAdd: (card: ScryfallCard, zone: DeckZone) => void | Promise<void>;
}

const PROFILE_ROWS: { key: Exclude<keyof SimulationResult["userProfile"], "label">; label: string }[] = [
  { key: "ramp", label: "Ramp" },
  { key: "removal", label: "Removal" },
  { key: "wipes", label: "Wipes" },
  { key: "draw", label: "Draw" },
  { key: "tutors", label: "Tutors" },
  { key: "counterspells", label: "Counterspells" },
  { key: "avgCmc", label: "Avg CMC" },
  { key: "landCount", label: "Lands" },
  { key: "gameChangers", label: "Game Changers" },
];

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const CARD_STAGGER_MS = 90;
const COUNT_UP_MS = 600;

export function SimulatePanel({ deckId, hasCommander, onAdd }: Props) {
  const [bracket, setBracket] = useState(3);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [animatedWinRate, setAnimatedWinRate] = useState(0);

  // Flip each game's card face-up in a staggered cascade, then count the win
  // rate up to its final value — a small, honest flourish (it's just
  // revealing an already-computed result, not literally playing games out).
  useEffect(() => {
    if (!revealed || !result) return;
    const target = Math.round(result.winRate * 100);
    const revealMs = result.gameResults.length * CARD_STAGGER_MS;
    const start = performance.now() + revealMs;
    let frame: number;
    function tick(now: number) {
      const t = Math.min(1, Math.max(0, (now - start) / COUNT_UP_MS));
      setAnimatedWinRate(Math.round(target * t));
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [revealed, result]);

  async function runSimulation() {
    setLoading(true);
    setError(null);
    setRevealed(false);
    setAnimatedWinRate(0);
    try {
      const res = await fetch(`/api/decks/${deckId}/simulate?bracket=${bracket}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "Couldn't run the simulation. Try again.");
        return;
      }
      setResult(data.result);
      setSuggestions(data.suggestions ?? []);
      requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)));
    } catch {
      setError("Couldn't run the simulation. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(card: ScryfallCard, zone: DeckZone) {
    setAddingId(card.id + zone);
    try {
      await onAdd(card, zone);
      if (zone === "mainboard") setSuggestions((prev) => prev.map((g) => ({ ...g, cards: g.cards.filter((c) => c.id !== card.id) })));
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-black/40 dark:text-white/40">
        A statistical approximation — not a real game simulation. Opponents are synthetic stat profiles typical of the
        chosen bracket (not real decklists), and each &quot;game&quot; is a simplified, randomized model of board
        development, interaction, and combo chance, not actual Magic rules. Useful for comparing your deck&apos;s
        shape against a target power level, not for predicting real results.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-black/60 dark:text-white/60">Opponent bracket</span>
        <div className="flex flex-wrap gap-1">
          {BRACKETS.map((b) => (
            <button
              key={b.value}
              onClick={() => setBracket(b.value)}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                bracket === b.value
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-black/15 text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/10"
              }`}
            >
              {b.value}
            </button>
          ))}
        </div>
        <span className="text-xs text-black/40 dark:text-white/40">{BRACKETS.find((b) => b.value === bracket)?.label}</span>
      </div>

      <button
        onClick={runSimulation}
        disabled={!hasCommander || loading}
        className="inline-flex max-w-max items-center gap-2 self-start rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-black/30 dark:border-t-black" />}
        {loading ? "Playing 10 games…" : result ? "Run again" : "Run simulation"}
      </button>
      {!hasCommander && <p className="text-xs text-black/40 dark:text-white/40">Pick a commander first.</p>}
      {error && <p className="text-xs text-[#d03b3b]">{error}</p>}

      {result && (
        <>
          <div className="flex flex-wrap gap-1.5 [perspective:500px]">
            {result.gameResults.map((won, i) => (
              <div key={i} title={`Game ${i + 1}: ${won ? "win" : "loss"}`} className="h-9 w-7 shrink-0">
                <div
                  className={`relative h-full w-full transition-transform duration-500 ease-out [transform-style:preserve-3d] ${
                    revealed ? "[transform:rotateY(180deg)]" : ""
                  }`}
                  style={{ transitionDelay: `${i * CARD_STAGGER_MS}ms` }}
                >
                  {/* Card back — face up until this game's result is revealed */}
                  <div className="absolute inset-0 rounded-[3px] border border-white/25 bg-gradient-to-br from-indigo-950 via-indigo-900 to-black shadow-sm [backface-visibility:hidden]">
                    <div className="absolute inset-[3px] rounded-[2px] border border-white/10" />
                  </div>
                  {/* Result face — pre-rotated, so it lands right-reading once the card flips */}
                  <div
                    className={`absolute inset-0 flex items-center justify-center rounded-[3px] border text-xs font-bold text-white [backface-visibility:hidden] [transform:rotateY(180deg)] ${
                      won ? "border-[#0ca30c] bg-[#0ca30c]/85" : "border-[#d03b3b] bg-[#d03b3b]/85"
                    }`}
                  >
                    {won ? "✓" : "✕"}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Estimated win rate</span>
              <span className="text-lg font-bold tabular-nums">{animatedWinRate}%</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-2 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${animatedWinRate}%` }} />
            </div>
            <div className="mt-1 text-xs text-black/50 dark:text-white/50">
              Won {result.wins} of {result.games} simulated games against bracket {result.bracket} opponents.
            </div>
            {result.projectionScale > 1.1 && (
              <div className="mt-1 text-xs text-black/40 dark:text-white/40">
                Your deck isn&apos;t full yet, so ramp/removal/draw/tutor/counterspell counts below are projected ×
                {result.projectionScale.toFixed(1)} to what they&apos;d be at a full 99 nonland cards, at your current
                ratio — comparing deck shape, not raw card count.
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="text-left text-black/40 dark:text-white/40">
                  <th className="py-1 pr-2 font-medium">Stat</th>
                  <th className="px-2 py-1 font-medium">Your deck</th>
                  {result.opponents.map((o) => (
                    <th key={o.label} className="px-2 py-1 font-medium">
                      {o.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PROFILE_ROWS.map((row) => (
                  <tr key={row.key} className="border-t border-black/5 dark:border-white/5">
                    <td className="py-1 pr-2 text-black/60 dark:text-white/60">{row.label}</td>
                    <td className="px-2 py-1 font-medium tabular-nums">{fmt(result.userProfile[row.key])}</td>
                    {result.opponents.map((o) => (
                      <td key={o.label} className="px-2 py-1 tabular-nums text-black/60 dark:text-white/60">
                        {fmt(o[row.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.weakSpots.length > 0 && (
            <div className="text-xs text-black/60 dark:text-white/60">
              Behind bracket {result.bracket} typical numbers on: {result.weakSpots.map((w) => `${w.label} (${w.userValue} vs ~${w.benchmark})`).join(", ")}.
            </div>
          )}
        </>
      )}

      {suggestions.map((group) => (
        <div key={group.key}>
          <div className="mb-1">
            <div className="text-sm font-semibold">{group.label}</div>
            <div className="text-xs text-black/50 dark:text-white/50">{group.reason}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {group.cards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                actions={
                  <>
                    <button
                      onClick={() => handleAdd(card, "mainboard")}
                      disabled={addingId === card.id + "mainboard"}
                      className="rounded bg-white px-2 py-1 text-[11px] font-medium text-black hover:bg-white/90 disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => handleAdd(card, "maybeboard")}
                      disabled={addingId === card.id + "maybeboard"}
                      className="rounded bg-white/20 px-2 py-1 text-[11px] font-medium text-white hover:bg-white/30 disabled:opacity-50"
                    >
                      Maybe
                    </button>
                  </>
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
