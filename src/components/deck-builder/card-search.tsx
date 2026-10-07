"use client";

import { useEffect, useRef, useState } from "react";
import { CardTile, TILE_GRID_CLASS, cardTileId, tileButtonClass } from "./card-tile";
import { OverBudgetNote, useBudget } from "./budget";
import { useSuggesting } from "./suggest-mode";
import { splitByBudget } from "@/lib/budget-filter";
import type { ScryfallCard, DeckZone } from "./types";

interface Props {
  deckId: string;
  mode: "commander" | "card";
  onAdd: (card: ScryfallCard, zone: DeckZone) => void | Promise<void>;
  // Bump this number to focus the search box (the deck page does it when you press "/").
  focusSignal?: number;
}

const LOOKS_LIKE_SYNTAX = /[a-z!@-]+[:=]|[<>]=?/i;
const ZONE_NAME: Record<DeckZone, string> = { commander: "commander", mainboard: "the Mainboard", maybeboard: "the Maybeboard" };

export function CardSearch({ deckId, mode, onAdd, focusSignal = 0 }: Props) {
  const suggesting = useSuggesting();
  const { inBudget } = useBudget();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [settledQuery, setSettledQuery] = useState(""); // the query `cards` answers
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [justAdded, setJustAdded] = useState<{ id: string; name: string; zone: DeckZone } | null>(null);

  // Enter pressed before the results arrived: add the first match as soon as they do.
  const pendingZone = useRef<DeckZone | null>(null);
  const addFirstRef = useRef<(results: ScryfallCard[], zone: DeckZone, forQuery: string) => void>(() => {});

  const [showOverBudget, setShowOverBudget] = useState(false);

  // Over-budget cards are hidden (and counted), except one you typed the full name of.
  const split = splitByBudget(cards, inBudget, query);
  const visible = showOverBudget ? [...split.shown, ...split.hidden] : split.shown;

  useEffect(() => {
    if (!focusSignal) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    inputRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusSignal]);

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(null), 3000);
    return () => clearTimeout(timer);
  }, [justAdded]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!query.trim()) {
        setCards([]);
        setSettledQuery("");
        setSuggestions([]);
        setError(null);
        pendingZone.current = null;
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
        const results: ScryfallCard[] = data.cards ?? [];
        setCards(results);
        setSettledQuery(query);
        setActiveIndex(0);
        setSuggestions((suggestData.suggestions ?? []).filter((s: string) => s.toLowerCase() !== query.trim().toLowerCase()));
        if (data.error) setError(data.error);
        else if (results.length === 0) setError("No matches — try a different name, or Scryfall syntax like t:artifact o:draw.");
        if (pendingZone.current) {
          const zone = pendingZone.current;
          pendingZone.current = null;
          addFirstRef.current(results, zone, query);
        }
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
      setJustAdded({ id: card.id, name: card.name, zone });
      // Back to the search box with its text selected, so the next card is one keystroke away and the
      // results stay up. (Not on touch screens, where focusing it would pop the keyboard up after every add.)
      if (window.matchMedia("(pointer: fine)").matches) {
        inputRef.current?.focus({ preventScroll: true });
        inputRef.current?.select();
      }
    } finally {
      setAddingId(null);
    }
  }

  useEffect(() => {
    addFirstRef.current = (results, zone, forQuery) => {
      const { shown, hidden } = splitByBudget(results, inBudget, forQuery);
      const first = (showOverBudget ? [...shown, ...hidden] : shown)[0];
      if (first) void handleAdd(first, zone);
    };
  });

  function addActive(zone: DeckZone) {
    const card = visible[activeIndex] ?? visible[0];
    if (card) void handleAdd(card, zone);
  }

  function moveActive(delta: number) {
    if (visible.length === 0) return;
    const next = Math.min(visible.length - 1, Math.max(0, activeIndex + delta));
    setActiveIndex(next);
    requestAnimationFrame(() => document.getElementById(cardTileId(visible[next].id))?.scrollIntoView({ block: "nearest" }));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!query.trim()) return;
      const zone: DeckZone = mode === "commander" ? "commander" : e.shiftKey ? "maybeboard" : "mainboard";
      if (loading || settledQuery !== query) pendingZone.current = zone;
      else addActive(zone);
    } else if (e.key === "Escape") {
      // Clear the box; pressing it again leaves the box.
      if (query) setQuery("");
      else inputRef.current?.blur();
    }
  }

  const addedLabel = (card: ScryfallCard, zone: DeckZone, idle: string) => (justAdded?.id === card.id && justAdded.zone === zone ? "✓ Added" : idle);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={mode === "commander" ? "Search for a commander by name…" : "Search cards by name… (or Scryfall syntax like t:artifact o:draw)"}
          aria-label={mode === "commander" ? "Search for a commander" : "Search for cards"}
          className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-black/40 dark:text-white/40">Did you mean</span>
          {suggestions.slice(0, 6).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setQuery(name);
                inputRef.current?.focus({ preventScroll: true });
              }}
              className="rounded-full border border-black/15 px-2 py-0.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <p className="-mt-1 text-[11px] text-black/40 dark:text-white/40">
        {mode === "commander" ? (
          <>
            <Key>Enter</Key> sets the first match as commander
          </>
        ) : suggesting ? (
          <>
            <Key>Enter</Key> suggests the highlighted card · <Key>↑</Key>
            <Key>↓</Key> choose · press <Key>/</Key> anywhere to search
          </>
        ) : (
          <>
            <Key>Enter</Key> adds the highlighted card · <Key>Shift</Key>+<Key>Enter</Key> adds it to the Maybeboard · <Key>↑</Key>
            <Key>↓</Key> choose · press <Key>/</Key> anywhere to search
          </>
        )}
      </p>
      <p role="status" aria-live="polite" className="min-h-4 text-xs font-medium text-[#0b7a0b] dark:text-[#3fd13f]">
        {justAdded ? `✓ Added ${justAdded.name} to ${ZONE_NAME[justAdded.zone]}` : ""}
      </p>
      {loading && <p className="text-xs text-black/40 dark:text-white/40">Searching…</p>}
      {error && !loading && <p className="text-xs text-black/40 dark:text-white/40">{error}</p>}
      {cards.length > 0 && <OverBudgetNote hidden={split.hidden.length} showing={showOverBudget} onToggle={() => setShowOverBudget((s) => !s)} />}
      {cards.length > 0 && (
        <div className={TILE_GRID_CLASS}>
          {visible.map((card, i) => (
            <CardTile
              key={card.id}
              card={card}
              active={focused && i === activeIndex}
              actions={
                mode === "commander" ? (
                  <button
                    onClick={() => handleAdd(card, "commander")}
                    disabled={addingId === card.id + "commander"}
                    className={tileButtonClass("primary")}
                  >
                    Set commander
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleAdd(card, "mainboard")}
                      disabled={addingId === card.id + "mainboard"}
                      className={tileButtonClass("primary")}
                    >
                      {addedLabel(card, "mainboard", suggesting ? "Suggest" : "Add")}
                    </button>
                    {!suggesting && (
                      <button
                        onClick={() => handleAdd(card, "maybeboard")}
                        disabled={addingId === card.id + "maybeboard"}
                        className={tileButtonClass("secondary")}
                      >
                        {addedLabel(card, "maybeboard", "Maybe")}
                      </button>
                    )}
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

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-black/20 bg-black/[0.04] px-1 font-sans text-[10px] dark:border-white/25 dark:bg-white/[0.06]">{children}</kbd>
  );
}
