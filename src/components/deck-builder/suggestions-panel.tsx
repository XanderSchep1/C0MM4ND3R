"use client";

import { useState } from "react";
import { CardTile } from "./card-tile";
import type { ScryfallCard, SuggestionGroup } from "./types";

interface Props {
  deckId: string;
  hasCommander: boolean;
  onAdd: (card: ScryfallCard) => void | Promise<void>;
}

export function SuggestionsPanel({ deckId, hasCommander, onAdd }: Props) {
  const [groups, setGroups] = useState<SuggestionGroup[] | null>(null);
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
      setGroups((prev) => prev?.map((g) => ({ ...g, cards: g.cards.filter((c) => c.id !== card.id) })) ?? prev);
    } finally {
      setAddingId(null);
    }
  }

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

      {groups?.map((group) => (
        <div key={group.key}>
          <div className="mb-1">
            <div className="text-sm font-semibold">{group.label}</div>
            <div className="text-xs text-black/50 dark:text-white/50">{group.reason}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {group.cards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                actions={
                  <button
                    onClick={() => handleAdd(card)}
                    disabled={addingId === card.id}
                    className="rounded bg-white px-2 py-1 text-[11px] font-medium text-black hover:bg-white/90 disabled:opacity-50"
                  >
                    Add
                  </button>
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
