"use client";

import { useEffect, useState } from "react";
import { CardTile } from "./card-tile";
import type { ScryfallCard, DeckZone } from "./types";

interface Props {
  deckId: string;
  mode: "commander" | "card";
  onAdd: (card: ScryfallCard, zone: DeckZone) => void | Promise<void>;
}

const LOOKS_LIKE_SYNTAX = /[a-z!@-]+[:=]|[<>]=?/i;

export function CardSearch({ deckId, mode, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!query.trim()) {
        setCards([]);
        setSuggestions([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: query, mode, deckId });
        const searchPromise = fetch(`/api/scryfall/search?${params}`).then((r) => r.json());
        const suggestPromise = LOOKS_LIKE_SYNTAX.test(query)
          ? Promise.resolve({ suggestions: [] })
          : fetch(`/api/scryfall/autocomplete?q=${encodeURIComponent(query)}`).then((r) => r.json());

        const [data, suggestData] = await Promise.all([searchPromise, suggestPromise]);
        setCards(data.cards ?? []);
        setSuggestions((suggestData.suggestions ?? []).filter((s: string) => s.toLowerCase() !== query.trim().toLowerCase()));
        setShowSuggestions(true);
        if ((data.cards ?? []).length === 0) setError("No matches — try a different name, or Scryfall syntax like t:artifact o:draw.");
      } catch {
        setError("Search failed. Try again.");
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [query, mode, deckId]);

  async function handleAdd(card: ScryfallCard, zone: DeckZone) {
    setAddingId(card.id + zone);
    try {
      await onAdd(card, zone);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setShowSuggestions(false)}
          placeholder={mode === "commander" ? "Search for a commander by name…" : "Search cards by name… (or Scryfall syntax like t:artifact o:draw)"}
          className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-black/15 bg-white text-sm shadow-lg dark:border-white/15 dark:bg-black">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setQuery(s);
                    setShowSuggestions(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {loading && <p className="text-xs text-black/40 dark:text-white/40">Searching…</p>}
      {error && !loading && <p className="text-xs text-black/40 dark:text-white/40">{error}</p>}
      {cards.length > 0 && (
        <div className="grid max-h-[520px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {cards.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              actions={
                mode === "commander" ? (
                  <button
                    onClick={() => handleAdd(card, "commander")}
                    disabled={addingId === card.id + "commander"}
                    className="rounded bg-white px-2 py-1 text-[11px] font-medium text-black hover:bg-white/90 disabled:opacity-50"
                  >
                    Set commander
                  </button>
                ) : (
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
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
