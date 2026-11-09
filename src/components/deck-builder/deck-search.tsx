"use client";

import { useState } from "react";
import { BudgetControl } from "./budget";
import { WIDE_TILE_GRID_CLASS } from "./card-tile";
import { CardSearch } from "./card-search";
import { KeywordSearch } from "./keyword-search";
import type { DeckZone, ScryfallCard } from "./types";

interface Props {
  deckId: string;
  // The colours the deck's commander gives it (see searchScope).
  scope: string;
  // Bump this number to focus the box that is showing (the deck page does it when you press "/").
  focusSignal: number;
  onAdd: (card: ScryfallCard, zone: DeckZone) => void | Promise<void>;
}

type Kind = "card" | "keyword";

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "card", label: "Card" },
  { kind: "keyword", label: "Keyword" },
];

// The search that sits above the decklist: one box for a card you have in mind, one for "what cards do X".
export function DeckSearch({ deckId, scope, focusSignal, onAdd }: Props) {
  const [kind, setKind] = useState<Kind>("card");
  // Counts clicks on the toggle, so switching also puts the cursor in the box you switched to.
  const [switches, setSwitches] = useState(0);

  // Only the box that is showing is told to focus; the other one stays at 0 so it never grabs the cursor.
  const focusFor = (k: Kind) => (k === kind ? focusSignal + switches : 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="radiogroup" aria-label="Search by" className="inline-flex rounded-md border border-black/15 p-0.5 text-xs font-medium dark:border-white/20">
          {KINDS.map(({ kind: k, label }) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => {
                if (k === kind) return;
                setKind(k);
                setSwitches((n) => n + 1);
              }}
              className={`rounded px-3 py-1 ${kind === k ? "bg-black text-white dark:bg-white dark:text-black" : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <BudgetControl className="" />
      </div>

      {/* Both stay mounted, so what you typed (and its results) is still there when you switch back. */}
      <div hidden={kind !== "card"}>
        <CardSearch deckId={deckId} mode="card" scope={scope} focusSignal={focusFor("card")} gridClass={WIDE_TILE_GRID_CLASS} onAdd={onAdd} />
      </div>
      <div hidden={kind !== "keyword"}>
        <KeywordSearch deckId={deckId} scope={scope} focusSignal={focusFor("keyword")} gridClass={WIDE_TILE_GRID_CLASS} onAdd={onAdd} />
      </div>
    </div>
  );
}
