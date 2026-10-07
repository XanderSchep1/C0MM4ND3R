"use client";

import { useState } from "react";
import { cardImageUrl, formatPrice } from "@/lib/card-helpers";
import { HoverPreview } from "./card-hover-name";
import { CardTile, tileButtonClass } from "./card-tile";
import type { ReplacementMode, ReplacementResult, ReplacementRow, ScryfallCard } from "./types";

interface Props {
  deckId: string;
  hasCommander: boolean;
  onSwap: (incoming: ScryfallCard, outgoing: ScryfallCard) => void | Promise<void>;
}

const ROWS_PER_STEP = 8;
const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;

// The "Upgrades" tab. It looks at every non-basic card in the deck and finds popular cards that do
// the same job for less money (budget swaps) or for more (the pricier, more played version).
// Nothing is looked up until one of the two buttons is pressed.
export function ReplacementsPanel({ deckId, hasCommander, onSwap }: Props) {
  const [result, setResult] = useState<ReplacementResult | null>(null);
  const [resultMode, setResultMode] = useState<ReplacementMode | null>(null);
  const [loading, setLoading] = useState<ReplacementMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shown, setShown] = useState(ROWS_PER_STEP);

  async function find(mode: ReplacementMode) {
    setLoading(mode);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/replacements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "Couldn't look for replacements. Try again.");
        return;
      }
      setResult(data);
      setResultMode(mode);
      setShown(ROWS_PER_STEP);
    } catch {
      setError("Couldn't look for replacements. Try again.");
    } finally {
      setLoading(null);
    }
  }

  async function swap(row: ReplacementRow, incoming: ScryfallCard) {
    setBusyId(incoming.id);
    try {
      await onSwap(incoming, row.current);
      // That line is done, and the same replacement can't be offered for another card too.
      setResult((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows
                .filter((r) => r.current.id !== row.current.id)
                .map((r) => ({ ...r, options: r.options.filter((o) => o.card.id !== incoming.id) }))
                .filter((r) => r.options.length > 0),
            }
          : prev
      );
    } finally {
      setBusyId(null);
    }
  }

  // If you took the first suggestion for every card: the total change in cost.
  const total = result ? result.rows.reduce((sum, r) => sum + r.options[0].priceDiff * r.quantity, 0) : 0;
  const cheaper = resultMode === "cheaper";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-black/50 dark:text-white/50">
        Checks every non-basic card in your deck against popular cards that do the same job (same kind of card, similar mana cost). Nothing is
        looked up until you press a button.
      </p>

      <div className="flex flex-wrap gap-2">
        {(["cheaper", "pricier"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => find(mode)}
            disabled={!hasCommander || loading !== null}
            aria-busy={loading === mode}
            className={
              mode === "cheaper"
                ? "inline-flex items-center gap-2 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
                : "inline-flex items-center gap-2 rounded-md border border-black/25 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/30 dark:hover:bg-white/10"
            }
          >
            {loading === mode && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />}
            {loading === mode ? "Checking your deck…" : mode === "cheaper" ? "Find cheaper replacements" : "Find pricier upgrades"}
          </button>
        ))}
      </div>
      {!hasCommander && <p className="text-xs text-black/40 dark:text-white/40">Pick a commander first.</p>}
      {error && <p className="text-xs text-[#d03b3b]">{error}</p>}

      {result && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p className="text-xs text-black/50 dark:text-white/50">
            Looked at {result.checked} card{result.checked === 1 ? "" : "s"}; {result.withRole} have a clear job to compare within (ramp, removal, draw,
            lands…), the rest are left alone.
          </p>

          {result.rows.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">
              {cheaper
                ? "No clearly cheaper replacements — the pricey cards here don't have a similar, well-played, cheaper alternative."
                : "No clearly better, pricier replacements found."}
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold">
                {result.rows.length} card{result.rows.length === 1 ? "" : "s"} with {cheaper ? "a cheaper" : "a pricier"} option
                <span className="ml-2 text-xs font-normal text-black/50 dark:text-white/50">
                  {cheaper ? `taking the first suggestion for each saves about ${money(total)}` : `taking the first suggestion for each costs about ${money(total)} more`}
                </span>
              </p>

              <ul className="flex flex-col gap-3">
                {result.rows.slice(0, shown).map((row) => {
                  const img = cardImageUrl(row.current, "normal");
                  return (
                    <li key={row.current.id} className="rounded-md border border-black/10 p-2 dark:border-white/10">
                      <HoverPreview as="div" placement="beside" imageUri={img} alt={row.current.name} price={formatPrice(row.current)} className="mb-2 text-xs">
                        <span className="text-black/50 dark:text-white/50">Replace </span>
                        <span className="font-semibold">{row.current.name}</span>
                        <span className="text-black/50 dark:text-white/50">
                          {" "}
                          {formatPrice(row.current)} · {row.role}
                          {row.quantity > 1 ? ` · ×${row.quantity}` : ""}
                        </span>
                      </HoverPreview>
                      <div className="grid grid-cols-3 content-start gap-2">
                        {row.options.map((option) => (
                          <CardTile
                            key={option.card.id}
                            card={option.card}
                            actions={
                              <>
                                <div
                                  className={`text-center text-[11px] font-semibold ${
                                    option.priceDiff < 0 ? "text-[#0b7a0b] dark:text-[#3fd13f]" : "text-[#8a5a00] dark:text-[#fab219]"
                                  }`}
                                >
                                  {option.priceDiff < 0 ? `Saves ${money(option.priceDiff)}` : `+${money(option.priceDiff)}`}
                                </div>
                                <button
                                  onClick={() => swap(row, option.card)}
                                  disabled={busyId === option.card.id}
                                  aria-label={`Swap ${row.current.name} for ${option.card.name}`}
                                  className={tileButtonClass("primary")}
                                >
                                  Swap
                                </button>
                              </>
                            }
                          />
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {shown < result.rows.length && (
                <button
                  onClick={() => setShown((n) => n + ROWS_PER_STEP)}
                  className="self-start rounded-md border border-black/25 px-3 py-1.5 text-xs font-semibold hover:bg-black/5 dark:border-white/30 dark:hover:bg-white/10"
                >
                  Show {Math.min(ROWS_PER_STEP, result.rows.length - shown)} more
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
