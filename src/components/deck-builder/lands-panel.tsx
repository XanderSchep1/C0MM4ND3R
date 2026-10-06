"use client";

import { useEffect, useState } from "react";
import { cardImageUrl, formatPrice } from "@/lib/card-helpers";
import { ColorPips } from "./color-pips";
import type { LandBalance, LandSuggestion } from "./types";

interface CategoryInfo {
  key: string;
  label: string;
  description: string;
}

interface Props {
  deckId: string;
  hasCommander: boolean;
  onChanged: () => void | Promise<void>;
}

const DEFAULT_SELECTED = ["fixing"];

function BalanceTable({ balance }: { balance: LandBalance }) {
  if (balance.colors.length === 0) {
    return <p className="text-xs text-black/50 dark:text-white/50">Your commander is colorless, so there are no colors to balance — utility lands are the main upgrade.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-black/10 p-3 dark:border-white/10">
      <div className="text-xs font-semibold">Mana balance ({balance.landCount}/{balance.landTarget} lands)</div>
      {balance.colors.map((c) => {
        const ok = c.deficit < 1;
        return (
          <div key={c.color} className="flex items-center gap-2 text-xs">
            <ColorPips identity={[c.color]} />
            <div className="h-2 flex-1 rounded-full bg-black/10 dark:bg-white/10">
              <div
                className={`h-2 rounded-full ${ok ? "bg-[#0ca30c]" : "bg-[#fab219]"}`}
                style={{ width: `${Math.min(100, (c.sources / c.target) * 100)}%` }}
              />
            </div>
            <span className="w-40 shrink-0 text-right tabular-nums text-black/60 dark:text-white/60">
              {Math.round(c.sources)} / ~{c.target} sources
            </span>
          </div>
        );
      })}
      <p className="text-[11px] text-black/40 dark:text-white/40">
        Targets are a rule of thumb based on how many of your deck&apos;s mana symbols are each color. Green means covered.
      </p>
    </div>
  );
}

export function LandsPanel({ deckId, hasCommander, onChanged }: Props) {
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [balance, setBalance] = useState<LandBalance | null>(null);
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [names, setNames] = useState("");

  const [phase, setPhase] = useState<"setup" | "review" | "done">("setup");
  const [queue, setQueue] = useState<LandSuggestion[]>([]);
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [skipped, setSkipped] = useState(0);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasCommander) return;
    let cancelled = false;
    fetch(`/api/decks/${deckId}/lands`)
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? "Couldn't load your land balance.");
          return;
        }
        setCategories(data.categories);
        setBalance(data.balance);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your land balance.");
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, hasCommander]);

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function findLands() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/lands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: selected,
          names: names.split(/[,\n]/).map((n) => n.trim()).filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "Couldn't find lands. Try again.");
        return;
      }
      setBalance(data.balance);
      setNotes(data.notes);
      setQueue(data.suggestions);
      setIndex(0);
      setAdded([]);
      setSkipped(0);
      setPhase(data.suggestions.length > 0 ? "review" : "done");
    } catch {
      setError("Couldn't find lands. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function advance() {
    if (index + 1 >= queue.length) setPhase("done");
    else setIndex(index + 1);
  }

  async function answerYes(suggestion: LandSuggestion) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/lands/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scryfallId: suggestion.card.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "Couldn't add that land.");
        return;
      }
      setBalance(data.balance);
      setAdded((prev) => [...prev, data.removed ? `${data.added} (replaced a ${data.removed})` : data.added]);
      if (data.warning) setNotes((prev) => [...prev, data.warning]);
      await onChanged();
      advance();
    } catch {
      setError("Couldn't add that land.");
    } finally {
      setBusy(false);
    }
  }

  function answerNo() {
    setSkipped((n) => n + 1);
    advance();
  }

  if (!hasCommander) return <p className="text-xs text-black/40 dark:text-white/40">Pick a commander first.</p>;

  const current = phase === "review" ? queue[index] : undefined;

  return (
    <div className="flex flex-col gap-4">
      {balance && <BalanceTable balance={balance} />}
      {error && <p className="text-xs text-[#d03b3b]">{error}</p>}

      {phase === "setup" && (
        <>
          <div>
            <div className="mb-1 text-sm font-semibold">Which special lands do you want?</div>
            <div className="flex flex-col gap-2">
              {categories.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-0.5" checked={selected.includes(c.key)} onChange={() => toggle(c.key)} />
                  <span>
                    <span className="font-medium">{c.label}</span>
                    <span className="block text-black/50 dark:text-white/50">{c.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Specific lands you want to try (optional)</span>
            <input
              value={names}
              onChange={(e) => setNames(e.target.value)}
              placeholder="e.g. Command Tower, Misty Rainforest"
              className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            />
            <span className="text-black/40 dark:text-white/40">Separate names with commas. They&apos;re shown first.</span>
          </label>
          <button
            onClick={findLands}
            disabled={loading}
            className="inline-flex max-w-max items-center gap-2 self-start rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-black/30 dark:border-t-black" />}
            {loading ? "Finding lands…" : "Find the best lands"}
          </button>
        </>
      )}

      {current && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="text-xs text-black/50 dark:text-white/50">
            Land {index + 1} of {queue.length}
          </div>
          {cardImageUrl(current.card, "normal") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cardImageUrl(current.card, "normal")} alt={current.card.name} width={240} height={335} className="w-60 rounded-xl shadow-lg" />
          ) : (
            <div className="flex h-80 w-60 items-center justify-center rounded-xl bg-black/5 p-2 text-center text-sm dark:bg-white/5">{current.card.name}</div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm font-semibold">
            {current.card.name}
            <ColorPips identity={current.colors} />
            <span className="rounded-full bg-black/85 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white dark:bg-white/90 dark:text-black">{formatPrice(current.card)}</span>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 text-[10px] font-medium uppercase">
            <span className="rounded bg-black/5 px-1.5 py-0.5 text-black/60 dark:bg-white/10 dark:text-white/60">{current.category}</span>
            {current.requested && <span className="rounded bg-[#2a78d6] px-1.5 py-0.5 text-white">You asked for this</span>}
            {current.tapped && <span className="rounded bg-[#fab219]/20 px-1.5 py-0.5 text-[#8a5a00] dark:text-[#fab219]">Enters tapped</span>}
          </div>
          <p className="max-w-xs text-center text-xs text-black/60 dark:text-white/60">{current.reason}</p>
          <p className="text-[11px] text-black/40 dark:text-white/40">Add this land to your deck?</p>
          <div className="flex gap-3">
            <button
              onClick={() => answerYes(current)}
              disabled={busy}
              className="w-28 rounded-md bg-[#0ca30c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0ca30c]/90 disabled:opacity-50"
            >
              {busy ? "Adding…" : "Yes"}
            </button>
            <button
              onClick={answerNo}
              disabled={busy}
              className="w-28 rounded-md bg-[#d03b3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d03b3b]/90 disabled:opacity-50"
            >
              No
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-2 rounded-md border border-black/10 p-3 text-xs dark:border-white/10">
          {queue.length === 0 ? (
            <p>No matching lands found that aren&apos;t already in your deck. Try selecting more categories.</p>
          ) : (
            <p className="font-medium">
              Done — added {added.length}, skipped {skipped}.
            </p>
          )}
          {added.length > 0 && (
            <ul className="list-disc pl-4 text-black/70 dark:text-white/70">
              {added.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setPhase("setup")}
            className="mt-1 max-w-max rounded-md border border-black/15 px-3 py-1.5 font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            Find more lands
          </button>
        </div>
      )}

      {notes.length > 0 && phase !== "setup" && (
        <ul className="list-disc pl-4 text-[11px] text-black/50 dark:text-white/50">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
