"use client";

import { useEffect, useState } from "react";
import { buildKeywordClause } from "@/lib/search-query";
import { CardTile, tileButtonClass } from "./card-tile";
import { useBudget } from "./budget";
import type { ScryfallCard, DeckZone } from "./types";

interface Props {
  deckId: string;
  onAdd: (card: ScryfallCard, zone: DeckZone) => void | Promise<void>;
}

// Separate from CardSearch (name lookup for a card you already know) — this
// is for discovery: "what cards do X", by searching oracle text for a word
// or phrase, then presenting matches as a suggested-adds list rather than a
// quick single-card lookup.
export function KeywordSearch({ deckId, onAdd }: Props) {
  const { inBudget } = useBudget();
  const [term, setTerm] = useState("");
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(async () => {
      const clause = buildKeywordClause(term);
      if (!clause) {
        setCards([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: clause, mode: "card", deckId });
        const res = await fetch(`/api/scryfall/search?${params}`);
        const data = await res.json();
        setCards(data.cards ?? []);
        if ((data.cards ?? []).length === 0) setError("No cards found using that keyword in your colors.");
      } catch {
        setError("Search failed. Try again.");
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [term, deckId]);

  async function handleAdd(card: ScryfallCard, zone: DeckZone) {
    setAddingId(card.id + zone);
    try {
      await onAdd(card, zone);
      setCards((prev) => (zone === "mainboard" ? prev.filter((c) => c.id !== card.id) : prev));
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by keyword or ability… (e.g. flying, lifelink, draw a card)"
        className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
      />
      {loading && <p className="text-xs text-black/40 dark:text-white/40">Searching oracle text…</p>}
      {error && !loading && <p className="text-xs text-black/40 dark:text-white/40">{error}</p>}
      {cards.length > 0 && (
        <>
          <p className="text-xs text-black/50 dark:text-white/50">
            Suggested adds using &quot;{term.trim()}&quot;, sorted by Commander popularity:
          </p>
          <div className="grid max-h-[520px] grid-cols-3 gap-2 overflow-y-auto">
            {cards.filter(inBudget).map((card) => (
              <CardTile
                key={card.id}
                card={card}
                actions={
                  <>
                    <button
                      onClick={() => handleAdd(card, "mainboard")}
                      disabled={addingId === card.id + "mainboard"}
                      className={tileButtonClass("primary")}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => handleAdd(card, "maybeboard")}
                      disabled={addingId === card.id + "maybeboard"}
                      className={tileButtonClass("secondary")}
                    >
                      Maybe
                    </button>
                  </>
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
