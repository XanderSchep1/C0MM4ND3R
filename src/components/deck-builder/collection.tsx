"use client";

import Link from "next/link";
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

// "What do I still need to buy for this deck?" — only shown once a collection exists.
export function ToBuySummary({ deck }: { deck: ResolvedDeck }) {
  const { loaded, unique, owned } = useCollection();
  const [copied, setCopied] = useState(false);
  if (!loaded) return null;
  if (unique === 0) {
    return (
      <Link href="/collection" className="block rounded-md border border-dashed border-black/20 px-3 py-2 text-xs text-black/60 hover:bg-black/5 dark:border-white/25 dark:text-white/60 dark:hover:bg-white/10">
        Add the cards you own to see what this deck still needs →
      </Link>
    );
  }

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
      <Link href="/collection" className="self-start text-[11px] text-black/50 underline hover:text-black dark:text-white/50 dark:hover:text-white">
        Manage my collection
      </Link>
    </div>
  );
}
