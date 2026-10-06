"use client";

import { useState } from "react";
import { CardTile, tileButtonClass } from "./card-tile";
import { CardHoverName } from "./card-hover-name";
import { THEMES } from "./types";
import type { AnnoyanceReport, ScryfallCard, DeckZone } from "./types";

const METER_COLOR: Record<AnnoyanceReport["meter"], string> = {
  Low: "text-[#0ca30c]",
  Medium: "text-[#8a5a00] dark:text-[#fab219]",
  High: "text-[#d03b3b]",
};

interface Props {
  deckId: string;
  report: AnnoyanceReport;
  onAdd: (card: ScryfallCard, zone: DeckZone) => void | Promise<void>;
}

export function SaltPanel({ deckId, report, onAdd }: Props) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Record<string, ScryfallCard[]>>({});
  const [loadingFor, setLoadingFor] = useState<string | null>(null);

  async function findAlternatives(cardId: string, themeKey: string, excludeName: string) {
    if (openFor === cardId) {
      setOpenFor(null);
      return;
    }
    setOpenFor(cardId);
    if (alternatives[cardId]) return;

    const theme = THEMES.find((t) => t.key === themeKey);
    if (!theme) return;
    setLoadingFor(cardId);
    try {
      const params = new URLSearchParams({ q: theme.scryfallClause, mode: "card", deckId });
      const res = await fetch(`/api/scryfall/search?${params}`);
      const data = await res.json();
      const cards: ScryfallCard[] = (data.cards ?? []).filter((c: ScryfallCard) => c.name !== excludeName);
      setAlternatives((prev) => ({ ...prev, [cardId]: cards.slice(0, 8) }));
    } finally {
      setLoadingFor(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-black/40 dark:text-white/40">
        A heuristic estimate from card text and Scryfall&apos;s Game Changers list — not EDHREC&apos;s actual Salt Score, which isn&apos;t available via any
        public API.
      </p>

      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Annoyance meter</span>
        <span className={`font-semibold ${METER_COLOR[report.meter]}`}>{report.meter}</span>
      </div>

      {report.flagged.length === 0 && <p className="text-xs text-black/40 dark:text-white/40">Nothing flagged — looks like a low-friction deck.</p>}

      <div className="flex flex-col gap-2">
        {report.flagged.map(({ card, traits, replaceThemeKey }) => (
          <div key={card.id} className="rounded-md border border-black/10 p-2 text-xs dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <CardHoverName card={card} className="font-medium" />
              {replaceThemeKey && (
                <button
                  onClick={() => findAlternatives(card.id, replaceThemeKey, card.name)}
                  className="shrink-0 rounded border border-black/15 px-2 py-0.5 text-[11px] font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  {openFor === card.id ? "Hide" : "Find alternative"}
                </button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {traits.map((t) => (
                <span key={t.key} className="rounded-full bg-[#d03b3b]/10 px-2 py-0.5 text-[10px] font-medium text-[#d03b3b]">
                  {t.label}
                </span>
              ))}
            </div>

            {openFor === card.id && (
              <div className="mt-2">
                {loadingFor === card.id && <p className="text-black/40 dark:text-white/40">Searching…</p>}
                {alternatives[card.id]?.length === 0 && <p className="text-black/40 dark:text-white/40">No alternatives found.</p>}
                <div className="grid grid-cols-3 gap-2">
                  {alternatives[card.id]?.map((alt) => (
                    <CardTile
                      key={alt.id}
                      card={alt}
                      actions={
                        <button
                          onClick={() => onAdd(alt, "mainboard")}
                          className={tileButtonClass("primary")}
                        >
                          Add
                        </button>
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
