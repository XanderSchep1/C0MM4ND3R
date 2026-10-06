"use client";

import { cardImageUrl } from "@/lib/card-helpers";
import type { ScryfallCard } from "./types";

export function CardTile({ card, actions }: { card: ScryfallCard; actions?: React.ReactNode }) {
  const img = cardImageUrl(card, "small");
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]">
      <div className="aspect-[5/7] w-full bg-black/5 dark:bg-white/5">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={card.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-[10px] text-black/40 dark:text-white/40">{card.name}</div>
        )}
      </div>
      {actions && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}
