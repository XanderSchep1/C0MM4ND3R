"use client";

import { cardImageUrl, cardManaCost, formatPrice, primaryTypeCategory, sortByCategoryThenName } from "@/lib/card-helpers";
import { CardNameText, HoverPreview } from "./card-hover-name";
import { ManaCost } from "./mana-cost";
import { useCollection } from "./collection";
import type { DeckCardEntry, DeckZone } from "./types";

interface Props {
  entries: DeckCardEntry[];
  onQuantityChange: (scryfallId: string, quantity: number) => void;
  onRemove: (scryfallId: string) => void;
  onMove: (scryfallId: string, newZone: DeckZone) => void;
  moveTargets: { zone: DeckZone; label: string }[];
}

export function Decklist({ entries, onQuantityChange, onRemove, onMove, moveTargets }: Props) {
  const { unique, owned } = useCollection();
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
                <HoverPreview
                  as="li"
                  placement="beside"
                  key={card.id}
                  imageUri={cardImageUrl(card, "normal")}
                  alt={card.name}
                  price={formatPrice(card)}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded py-1.5 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                >
                  <span className="w-6 shrink-0 text-right tabular-nums text-black/50 dark:text-white/50">{entry.quantity}×</span>
                  <CardNameText name={card.name} className="min-w-0 flex-1 truncate" />
                  {unique > 0 && owned(card) < entry.quantity && (
                    <span className="shrink-0 rounded bg-[#fab219]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#8a5a00] dark:text-[#fab219]" title="Not in your collection">
                      Need
                    </span>
                  )}
                  <span className="shrink-0">
                    <ManaCost cost={cardManaCost(card)} />
                  </span>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    <button
                      onClick={() => onQuantityChange(card.id, entry.quantity - 1)}
                      className="h-6 w-6 rounded border border-black/15 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      aria-label={`Remove one ${card.name}`}
                    >
                      −
                    </button>
                    <button
                      onClick={() => onQuantityChange(card.id, entry.quantity + 1)}
                      className="h-6 w-6 rounded border border-black/15 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      aria-label={`Add one ${card.name}`}
                    >
                      +
                    </button>
                    {moveTargets.map((t) => (
                      <button
                        key={t.zone}
                        onClick={() => onMove(card.id, t.zone)}
                        className="rounded border border-black/15 px-1.5 py-0.5 text-[10px] text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/10"
                      >
                        {t.label}
                      </button>
                    ))}
                    <button
                      onClick={() => onRemove(card.id)}
                      className="rounded border border-black/15 px-1.5 py-0.5 text-[10px] text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/10"
                    >
                      Remove
                    </button>
                  </div>
                </HoverPreview>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
