"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isBasicLand, priceValue } from "@/lib/card-helpers";
import type { ResolvedDeck, ScryfallCard } from "./types";

const keyOf = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

interface CollectionState {
  loaded: boolean;
  unique: number;
  total: number;
  // How many copies of this card the user owns (basic lands count as unlimited).
  owned: (card: ScryfallCard) => number;
  refresh: () => Promise<void>;
}

const CollectionContext = createContext<CollectionState>({ loaded: false, unique: 0, total: 0, owned: () => 0, refresh: async () => {} });

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<Map<string, number>>(new Map());
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/collection");
      if (!res.ok) return;
      const data = await res.json();
      setCards(new Map<string, number>(data.cards));
      setTotal(data.total);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/collection")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setCards(new Map<string, number>(data.cards));
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CollectionState>(
    () => ({
      loaded,
      unique: cards.size,
      total,
      refresh,
      owned: (card) => {
        if (isBasicLand(card)) return Number.POSITIVE_INFINITY;
        // Double-faced cards are listed by either their full or front-face name.
        return cards.get(keyOf(card.name)) ?? cards.get(keyOf(card.name.split(" // ")[0])) ?? 0;
      },
    }),
    [cards, total, loaded, refresh]
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionState {
  return useContext(CollectionContext);
}

export function CollectionPanel() {
  const { loaded, unique, total, refresh } = useCollection();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function importList() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mode }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ ok: false, text: data?.error ?? "Couldn't import that list." });
        return;
      }
      setMessage({ ok: true, text: `Imported ${data.imported} different cards. Your collection now has ${data.unique} different cards (${data.total} total).` });
      setText("");
      await refresh();
    } catch {
      setMessage({ ok: false, text: "Couldn't import that list." });
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!confirm("Remove every card from your collection? Your decks are not affected.")) return;
    setBusy(true);
    try {
      await fetch("/api/collection", { method: "DELETE" });
      setMessage({ ok: true, text: "Collection cleared." });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-black/60 dark:text-white/60">
        Tell the app which cards you already own. Your decks then show what you still need to buy and what it costs. Paste any list with one card
        per line (<span className="font-mono">1 Sol Ring</span>) — exports from Moxfield, Archidekt, Deckbox and TCGplayer all work. Basic lands never count as missing.
      </p>
      <div className="rounded-md border border-black/10 px-3 py-2 text-xs dark:border-white/10">
        {!loaded ? "Loading your collection…" : unique === 0 ? "Your collection is empty." : `You own ${unique} different cards (${total} total).`}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"1 Sol Ring\n1 Arcane Signet\n4 Lightning Bolt"}
        className="rounded-md border border-black/15 px-3 py-2 font-mono text-xs dark:border-white/15 dark:bg-black"
      />
      <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} /> Add to my collection
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace my whole collection
        </label>
      </div>
      {message && <p className={`text-xs ${message.ok ? "text-[#0b7a0b] dark:text-[#3fd13f]" : "text-[#d03b3b]"}`}>{message.text}</p>}
      <div className="flex gap-2">
        <button
          onClick={importList}
          disabled={busy || !text.trim()}
          className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {busy ? "Working…" : "Import list"}
        </button>
        {unique > 0 && (
          <button
            onClick={clearAll}
            disabled={busy}
            className="rounded-md border border-black/20 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/25 dark:hover:bg-white/10"
          >
            Clear collection
          </button>
        )}
      </div>
    </div>
  );
}

// "What do I still need to buy for this deck?" — only shown once a collection exists.
export function ToBuySummary({ deck }: { deck: ResolvedDeck }) {
  const { unique, owned } = useCollection();
  const [copied, setCopied] = useState(false);
  if (unique === 0) return null;

  const missing = [...deck.commanders, ...deck.mainboard]
    .map((e) => ({ card: e.card, need: Math.max(0, e.quantity - owned(e.card)) }))
    .filter((m) => m.need > 0)
    .sort((a, b) => (priceValue(b.card) ?? 0) * b.need - (priceValue(a.card) ?? 0) * a.need);
  const cardCount = missing.reduce((sum, m) => sum + m.need, 0);
  const cost = missing.reduce((sum, m) => sum + (priceValue(m.card) ?? 0) * m.need, 0);
  const unpriced = missing.filter((m) => priceValue(m.card) === null).length;

  async function copyList() {
    await navigator.clipboard.writeText(missing.map((m) => `${m.need} ${m.card.name}`).join("\n") + "\n");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (missing.length === 0) {
    return <div className="rounded-md bg-[#0ca30c]/15 px-3 py-2 text-xs font-medium text-[#0b7a0b] dark:text-[#3fd13f]">You own every card in this deck.</div>;
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-black/10 p-2.5 text-xs dark:border-white/10">
      <div className="flex items-center justify-between">
        <span className="font-medium text-black/60 dark:text-white/60">Still to buy</span>
        <span className="font-semibold tabular-nums">
          {cardCount} card{cardCount === 1 ? "" : "s"} · ${cost.toFixed(2)}
          {unpriced > 0 && <span className="font-normal text-black/40 dark:text-white/40"> +{unpriced} unpriced</span>}
        </span>
      </div>
      <ul className="flex flex-col gap-0.5 text-black/70 dark:text-white/70">
        {missing.slice(0, 5).map((m) => (
          <li key={m.card.id} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {m.need > 1 ? `${m.need}× ` : ""}
              {m.card.name}
            </span>
            <span className="shrink-0 tabular-nums">{priceValue(m.card) === null ? "—" : `$${(priceValue(m.card)! * m.need).toFixed(2)}`}</span>
          </li>
        ))}
        {missing.length > 5 && <li className="text-black/40 dark:text-white/40">…and {missing.length - 5} more</li>}
      </ul>
      <button onClick={copyList} className="self-start rounded-md border border-black/15 px-2 py-1 text-[11px] font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10">
        {copied ? "Copied!" : "Copy shopping list"}
      </button>
    </div>
  );
}
