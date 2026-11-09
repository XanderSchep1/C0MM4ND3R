"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { SEARCH_CACHE_VERSION } from "@/lib/search-scope";
import { useSuggesting } from "./suggest-mode";
import { CardTile, TILE_GRID_CLASS, tileButtonClass } from "./card-tile";
import { OverBudgetNote, useBudget } from "./budget";
import { splitByBudget } from "@/lib/budget-filter";
import type { ScryfallCard, DeckZone } from "./types";

interface Props {
  deckId: string;
  onAdd: (card: ScryfallCard, zone: DeckZone) => void | Promise<void>;
  // The colours the deck's commander gives it (see searchScope). Lets the browser keep answers for a day.
  scope?: string;
  // Bump this number to focus the search box.
  focusSignal?: number;
  // How the result tiles are laid out; the default suits the narrow sidebar.
  gridClass?: string;
  // What is typed, and the Scryfall clause it turns into ("" while there is nothing to search for). The caller owns
  // both, so its own controls (quick picks, options) can change what is searched.
  term: string;
  onTermChange: (term: string) => void;
  clause: string;
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  label: string;
  loadingText: string;
  emptyText: string;
  resultsText: (term: string) => string;
  onInputFocus?: () => void;
  // Extra controls shown under the box.
  children?: ReactNode;
}

// The discovery searches ("what cards do X": by rules text, by creature type): type something, get a list of
// suggested adds. Separate from CardSearch, which looks up a card you already have in mind by name.
export function ClauseSearch({ deckId, onAdd, scope = "", focusSignal = 0, gridClass = TILE_GRID_CLASS, term, onTermChange, clause, inputRef, placeholder, label, loadingText, emptyText, resultsText, onInputFocus, children }: Props) {
  const suggesting = useSuggesting();
  const { inBudget } = useBudget();
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [showOverBudget, setShowOverBudget] = useState(false);

  const split = splitByBudget(cards, inBudget);
  const visible = showOverBudget ? [...split.shown, ...split.hidden] : split.shown;

  useEffect(() => {
    if (!focusSignal) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    inputRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusSignal, inputRef]);

  useEffect(() => {
    // Flips when the clause changes, so a slow answer to an earlier search can't replace the answer to a later one.
    let stale = false;
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      if (!clause) {
        setCards([]);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: clause, mode: "card", deckId, v: SEARCH_CACHE_VERSION });
        if (scope) params.set("scope", scope);
        const res = await fetch(`/api/scryfall/search?${params}`, { signal: controller.signal });
        const data = await res.json();
        if (stale) return;
        setCards(data.cards ?? []);
        if (data.error) setError(data.error);
        else if ((data.cards ?? []).length === 0) setError(emptyText);
      } catch {
        if (!stale) setError("Search failed. Try again.");
      } finally {
        if (!stale) setLoading(false);
      }
    }, 200);
    return () => {
      stale = true;
      clearTimeout(handle);
      controller.abort();
    };
  }, [clause, deckId, scope, emptyText]);

  async function handleAdd(card: ScryfallCard, zone: DeckZone) {
    setAddingId(card.id + zone);
    try {
      await onAdd(card, zone);
      setCards((prev) => (zone === "mainboard" ? prev.filter((c) => c.id !== card.id) : prev));
      // Back to the search box so the next search is one keystroke away (not on touch screens: it would pop the keyboard up).
      if (window.matchMedia("(pointer: fine)").matches) {
        inputRef.current?.focus({ preventScroll: true });
        inputRef.current?.select();
      }
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        value={term}
        onChange={(e) => onTermChange(e.target.value)}
        onFocus={onInputFocus}
        placeholder={placeholder}
        aria-label={label}
        className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
      />
      {children}
      {loading && <p className="text-xs text-black/40 dark:text-white/40">{loadingText}</p>}
      {error && !loading && <p className="text-xs text-black/40 dark:text-white/40">{error}</p>}
      {cards.length > 0 && (
        <>
          <p className="text-xs text-black/50 dark:text-white/50">{resultsText(term)}</p>
          <OverBudgetNote hidden={split.hidden.length} showing={showOverBudget} onToggle={() => setShowOverBudget((s) => !s)} />
          <div className={gridClass}>
            {visible.map((card) => (
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
                      {suggesting ? "Suggest" : "Add"}
                    </button>
                    {!suggesting && (
                      <button
                        onClick={() => handleAdd(card, "maybeboard")}
                        disabled={addingId === card.id + "maybeboard"}
                        className={tileButtonClass("secondary")}
                      >
                        Maybe
                      </button>
                    )}
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
