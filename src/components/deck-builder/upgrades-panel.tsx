"use client";

import { useEffect, useState } from "react";
import { cardImageUrl, formatPrice, priceValue } from "@/lib/card-helpers";
import { CardHoverName, HoverPreview } from "./card-hover-name";
import type { ScryfallCard, SetInfo, UpgradeSuggestion, DeckZone } from "./types";

type SetWithSeen = SetInfo & { seen: boolean };

interface Props {
  deckId: string;
  hasCommander: boolean;
  onAdd: (card: ScryfallCard, zone: DeckZone) => void | Promise<void>;
  onSwap: (incoming: ScryfallCard, outgoing: ScryfallCard) => void | Promise<void>;
}

// "net +$1.20" / "net -$0.30": what the swap costs (or saves) when both cards have prices.
function netCost(incoming: ScryfallCard, outgoing: ScryfallCard): string | null {
  const a = priceValue(incoming);
  const b = priceValue(outgoing);
  if (a === null || b === null) return null;
  const diff = Math.round((a - b) * 100) / 100;
  return `net ${diff >= 0 ? "+" : "-"}$${Math.abs(diff).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Thumb({ card }: { card: ScryfallCard }) {
  const img = cardImageUrl(card, "small");
  return (
    <HoverPreview as="div" placement="beside" imageUri={cardImageUrl(card, "normal")} alt={card.name} price={formatPrice(card)} className="shrink-0">
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={card.name} className="h-[84px] w-[60px] rounded-[4px] object-cover" loading="lazy" />
      ) : (
        <div className="flex h-[84px] w-[60px] items-center justify-center rounded-[4px] bg-black/5 p-1 text-center text-[9px] dark:bg-white/5">{card.name}</div>
      )}
    </HoverPreview>
  );
}

export function UpgradesPanel({ deckId, hasCommander, onAdd, onSwap }: Props) {
  const [sets, setSets] = useState<SetWithSeen[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<UpgradeSuggestion[] | null>(null);
  const [checkedSets, setCheckedSets] = useState<SetInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/decks/${deckId}/upgrades`)
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? "Couldn't load recent sets.");
          return;
        }
        const list: SetWithSeen[] = data.sets;
        setSets(list);
        setSelected(new Set(list.filter((s) => !s.seen).map((s) => s.code)));
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load recent sets.");
      });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function findUpgrades() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/upgrades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sets: [...selected] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "Couldn't check for upgrades. Try again.");
        return;
      }
      setSuggestions(data.suggestions);
      setCheckedSets(data.sets);
      setSets((prev) => prev?.map((s) => (selected.has(s.code) ? { ...s, seen: true } : s)) ?? prev);
    } catch {
      setError("Couldn't check for upgrades. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function dropSuggestion(card: ScryfallCard) {
    setSuggestions((prev) => prev?.filter((s) => s.card.id !== card.id) ?? prev);
  }

  async function handleAdd(card: ScryfallCard, zone: DeckZone) {
    setBusyId(card.id + zone);
    try {
      await onAdd(card, zone);
      if (zone === "mainboard") dropSuggestion(card);
    } finally {
      setBusyId(null);
    }
  }

  async function handleSwap(incoming: ScryfallCard, outgoing: ScryfallCard) {
    setBusyId(incoming.id + "swap");
    try {
      await onSwap(incoming, outgoing);
      dropSuggestion(incoming);
    } finally {
      setBusyId(null);
    }
  }

  const setByCode = new Map(checkedSets.map((s) => [s.code, s]));
  const bySet = new Map<string, UpgradeSuggestion[]>();
  for (const s of suggestions ?? []) {
    const list = bySet.get(s.card.set) ?? [];
    list.push(s);
    bySet.set(s.card.set, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-black/40 dark:text-white/40">
        Checks recently released sets for cards that would improve this deck — same-job swaps that are cheaper or far more
        played, plus gap-fillers and cards that support your deck&apos;s detected plan. Popularity is EDHREC rank, so
        brand-new cards may have none yet.
      </p>

      {sets === null && !error && <p className="text-xs text-black/40 dark:text-white/40">Loading recent sets…</p>}
      {sets?.length === 0 && <p className="text-xs text-black/40 dark:text-white/40">No Commander-relevant sets released recently.</p>}

      {sets && sets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {sets.map((s) => (
            <label key={s.code} className="flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" checked={selected.has(s.code)} onChange={() => toggle(s.code)} />
              <span className="font-medium">{s.name}</span>
              <span className="text-black/40 dark:text-white/40">{formatDate(s.releasedAt)}</span>
              {!s.seen && (
                <span className="rounded bg-[#2a78d6] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">New</span>
              )}
            </label>
          ))}
        </div>
      )}

      <button
        onClick={findUpgrades}
        disabled={!hasCommander || loading || selected.size === 0}
        className="inline-flex max-w-max items-center gap-2 self-start rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-black/30 dark:border-t-black" />}
        {loading ? "Checking sets…" : suggestions ? "Check again" : `Find upgrades (${selected.size} set${selected.size === 1 ? "" : "s"})`}
      </button>
      {!hasCommander && <p className="text-xs text-black/40 dark:text-white/40">Pick a commander first.</p>}
      {error && <p className="text-xs text-[#d03b3b]">{error}</p>}

      {suggestions?.length === 0 && (
        <p className="text-xs text-black/40 dark:text-white/40">
          Nothing in the selected sets clearly improves this deck — it&apos;s already covering those roles well.
        </p>
      )}

      {[...bySet.entries()].map(([code, list]) => {
        const info = setByCode.get(code);
        return (
          <div key={code}>
            <div className="mb-2 text-sm font-semibold">
              {info?.name ?? code.toUpperCase()}
              {info && <span className="ml-2 text-xs font-normal text-black/40 dark:text-white/40">{formatDate(info.releasedAt)}</span>}
            </div>
            <ul className="flex flex-col gap-3">
              {list.map((s) => (
                <li key={s.card.id} className="flex gap-3 rounded-md border border-black/10 p-2 dark:border-white/10">
                  <Thumb card={s.card} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      <CardHoverName card={s.card} />
                      <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium uppercase text-black/50 dark:bg-white/10 dark:text-white/50">{s.label}</span>
                      <span className="text-[10px] font-medium uppercase text-black/40 dark:text-white/40">{s.card.reprint ? "Reprint" : "New card"}</span>
                      <span className="rounded bg-[#0ca30c]/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#0b7a0b] dark:text-[#3fd13f]">{formatPrice(s.card)}</span>
                    </div>
                    <div className="text-xs text-black/60 dark:text-white/60">{s.reason}</div>
                    {s.replaces && (
                      <div className="text-xs text-black/50 dark:text-white/50">
                        Replaces <CardHoverName card={s.replaces} /> ({formatPrice(s.replaces)}
                        {netCost(s.card, s.replaces) && <> · {netCost(s.card, s.replaces)}</>})
                      </div>
                    )}
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                      {s.replaces && (
                        <button
                          onClick={() => handleSwap(s.card, s.replaces as ScryfallCard)}
                          disabled={busyId === s.card.id + "swap"}
                          className="rounded bg-black px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                        >
                          Swap in
                        </button>
                      )}
                      <button
                        onClick={() => handleAdd(s.card, "mainboard")}
                        disabled={busyId === s.card.id + "mainboard"}
                        className="rounded border border-black/15 px-2 py-1 text-[11px] font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => handleAdd(s.card, "maybeboard")}
                        disabled={busyId === s.card.id + "maybeboard"}
                        className="rounded border border-black/15 px-2 py-1 text-[11px] font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
                      >
                        Maybe
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
