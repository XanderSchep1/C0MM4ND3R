"use client";

import { cardManaCost, primaryTypeCategory, sortByCategoryThenName } from "@/lib/card-helpers";
import { CardHoverName } from "./card-hover-name";
import { ManaCost } from "./mana-cost";
import type { DeckCardEntry } from "./types";

export function ReadOnlyDecklist({ entries }: { entries: DeckCardEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-black/40 dark:text-white/40">No cards here yet.</p>;
  }

  const sorted = sortByCategoryThenName(entries.map((e) => e.card));
  const byId = new Map(entries.map((e) => [e.card.id, e]));
  const groups = new Map<string, typeof sorted>();
  for (const card of sorted) {
    const cat = primaryTypeCategory(card);
    groups.set(cat, [...(groups.get(cat) ?? []), card]);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...groups.entries()].map(([category, cards]) => (
        <div key={category}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
            {category} ({cards.reduce((sum, c) => sum + (byId.get(c.id)?.quantity ?? 0), 0)})
          </div>
          <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
            {cards.map((card) => {
              const entry = byId.get(card.id)!;
              return (
                <li key={card.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
                  <span className="w-6 shrink-0 text-right tabular-nums text-black/50 dark:text-white/50">{entry.quantity}×</span>
                  <CardHoverName card={card} className="min-w-0 flex-1 truncate" />
                  <ManaCost cost={cardManaCost(card)} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
