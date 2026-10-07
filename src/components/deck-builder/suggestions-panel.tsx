"use client";

import { useState } from "react";
import { splitByBudget } from "@/lib/budget-filter";
import { clampPage, pageCount, pageRange, pageSlice } from "@/lib/book";
import { CardTile, tileButtonClass } from "./card-tile";
import { FlipBook } from "./flip-book";
import { useSuggesting } from "./suggest-mode";
import { OverBudgetNote, useBudget } from "./budget";
import type { ScryfallCard, SuggestionGroup } from "./types";

interface Props {
  deckId: string;
  hasCommander: boolean;
  onAdd: (card: ScryfallCard) => void | Promise<void>;
}

// Suggestions as a book: every gap in the deck (ramp, removal, …) is a chapter with up to 40
// popular cards, shown six to a page. Pick a chapter from the bookmarks, then turn the pages.
export function SuggestionsPanel({ deckId, hasCommander, onAdd }: Props) {
  const suggesting = useSuggesting();
  const { inBudget } = useBudget();
  const [groups, setGroups] = useState<SuggestionGroup[] | null>(null);
  const [chapterKey, setChapterKey] = useState<string | null>(null);
  const [pages, setPages] = useState<Record<string, number>>({});
  const [showOverBudget, setShowOverBudget] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  async function fetchSuggestions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/suggestions`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "Couldn't get suggestions. Try again.");
        return;
      }
      setGroups(data.groups);
      setChapterKey(data.groups[0]?.key ?? null);
      setPages({});
    } catch {
      setError("Couldn't get suggestions. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(card: ScryfallCard) {
    setAddingId(card.id);
    try {
      await onAdd(card);
      // The card leaves every chapter; the pages close up behind it.
      setGroups((prev) => prev?.map((g) => ({ ...g, cards: g.cards.filter((c) => c.id !== card.id) })) ?? prev);
    } finally {
      setAddingId(null);
    }
  }

  // The cards a chapter shows right now: all of them, or only those within the budget.
  const visibleCards = (g: SuggestionGroup) => (showOverBudget ? g.cards : splitByBudget(g.cards, inBudget).shown);

  const chapter = groups?.find((g) => g.key === chapterKey) ?? groups?.[0];
  const cards = chapter ? visibleCards(chapter) : [];
  const hiddenByBudget = chapter ? splitByBudget(chapter.cards, inBudget).hidden.length : 0;
  const page = chapter ? clampPage(pages[chapter.key] ?? 0, cards.length) : 0;
  const range = pageRange(page, cards.length);

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={fetchSuggestions}
        disabled={!hasCommander || loading}
        className="self-start rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {loading ? "Analyzing deck…" : groups ? "Refresh suggestions" : "Get suggestions"}
      </button>
      {!hasCommander && <p className="text-xs text-black/40 dark:text-white/40">Pick a commander first.</p>}
      {error && <p className="text-xs text-[#d03b3b]">{error}</p>}
      {groups && groups.length === 0 && (
        <p className="text-xs text-black/50 dark:text-white/50">Nothing to suggest — your deck covers every gap this checks for.</p>
      )}

      {groups && chapter && (
        <div className="flex flex-col gap-3">
          <div role="tablist" aria-label="Chapters" className="flex flex-wrap gap-1">
            {groups.map((g) => {
              const active = g.key === chapter.key;
              return (
                <button
                  key={g.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setChapterKey(g.key)}
                  className={`rounded-t-md border border-b-0 px-2.5 py-1 text-xs font-semibold ${
                    active
                      ? "border-black/25 bg-[#fbf8f1] text-black dark:border-white/30 dark:bg-neutral-900 dark:text-white"
                      : "border-black/10 text-black/55 hover:bg-black/5 dark:border-white/15 dark:text-white/55 dark:hover:bg-white/10"
                  }`}
                >
                  {g.label} <span className="font-normal opacity-70">{visibleCards(g).length}</span>
                </button>
              );
            })}
          </div>

          <div>
            <div className="text-sm font-semibold">{chapter.label}</div>
            <div className="text-xs text-black/50 dark:text-white/50">{chapter.reason}</div>
          </div>

          <OverBudgetNote hidden={hiddenByBudget} showing={showOverBudget} onToggle={() => setShowOverBudget((s) => !s)} />

          <FlipBook
            label={`${chapter.label} suggestions`}
            page={page}
            pageCount={pageCount(cards.length)}
            onPageChange={(next) => setPages((prev) => ({ ...prev, [chapter.key]: next }))}
            caption={cards.length > 0 ? `Cards ${range.from}–${range.to} of ${cards.length}` : undefined}
            renderPage={(index) =>
              cards.length === 0 ? (
                <p className="p-4 text-center text-xs text-black/50 dark:text-white/50">
                  {hiddenByBudget > 0 ? "Everything in this chapter is over your budget." : "No cards left in this chapter."}
                </p>
              ) : (
                <div className="grid grid-cols-3 content-start gap-2">
                  {pageSlice(cards, index).map((card) => (
                    <CardTile
                      key={card.id}
                      card={card}
                      actions={
                        <button onClick={() => handleAdd(card)} disabled={addingId === card.id} className={tileButtonClass("primary")}>
                          {suggesting ? "Suggest" : "Add"}
                        </button>
                      }
                    />
                  ))}
                </div>
              )
            }
          />
        </div>
      )}
    </div>
  );
}
