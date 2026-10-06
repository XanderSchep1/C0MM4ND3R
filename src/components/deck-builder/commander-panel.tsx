"use client";

import { useState } from "react";
import { cardImageUrl } from "@/lib/card-helpers";
import { CardSearch } from "./card-search";
import type { DeckCardEntry, ScryfallCard } from "./types";

interface Props {
  deckId: string;
  commanders: DeckCardEntry[];
  onAdd: (card: ScryfallCard) => void | Promise<void>;
  onRemove: (scryfallId: string) => void | Promise<void>;
}

export function CommanderPanel({ deckId, commanders, onAdd, onRemove }: Props) {
  const [searching, setSearching] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        {commanders.map(({ card }) => {
          const img = cardImageUrl(card, "normal");
          return (
            <div key={card.id} className="group relative w-32 shrink-0 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={card.name} className="w-full" />
              )}
              <button
                onClick={() => onRemove(card.id)}
                className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
              >
                Remove
              </button>
            </div>
          );
        })}
        {commanders.length < 2 && (
          <button
            onClick={() => setSearching((s) => !s)}
            className="flex w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-black/20 text-xs text-black/50 hover:border-black/40 dark:border-white/20 dark:text-white/50 dark:hover:border-white/40"
            style={{ aspectRatio: "5/7" }}
          >
            <span className="text-xl">+</span>
            <span>{commanders.length === 0 ? "Choose commander" : "Add partner"}</span>
          </button>
        )}
      </div>

      {searching && (
        <CardSearch
          deckId={deckId}
          mode="commander"
          onAdd={async (card) => {
            await onAdd(card);
            setSearching(false);
          }}
        />
      )}
    </div>
  );
}
