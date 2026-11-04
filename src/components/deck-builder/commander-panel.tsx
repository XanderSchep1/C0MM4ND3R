"use client";

import { useState } from "react";
import { cardImageUrl } from "@/lib/card-helpers";
import { canPair, pairingAbilities, describeAbility, pairingGuide } from "@/lib/commander-pairs";
import { companionCondition } from "@/lib/companion";
import { searchScope } from "@/lib/search-scope";
import { CardSearch } from "./card-search";
import type { DeckCardEntry, ScryfallCard } from "./types";
import { tileButtonClass } from "./card-tile";

type ArtZone = "commander" | "companion";

interface Props {
  deckId: string;
  commanders: DeckCardEntry[];
  companions: DeckCardEntry[];
  onAdd: (card: ScryfallCard) => void | Promise<void>;
  onRemove: (scryfallId: string) => void | Promise<void>;
  onAddCompanion: (card: ScryfallCard) => void | Promise<void>;
  onRemoveCompanion: (scryfallId: string) => void | Promise<void>;
  onChooseArt: (card: ScryfallCard, zone: ArtZone) => void;
  // A friend invited to the deck sees the commander but can't change it.
  readOnly?: boolean;
}

// Which search is open: the first commander, the second one (restricted to what pairs with the first), a second
// commander without that restriction (an escape hatch for a pairing ability we don't recognise), or the companion.
type Searching = "commander" | "partner" | "anyPartner" | "companion" | null;

const SLOT_CLASS =
  "flex w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-black/20 p-2 text-center text-xs text-black/50 hover:border-black/40 dark:border-white/20 dark:text-white/50 dark:hover:border-white/40";

export function CommanderPanel({ deckId, commanders, companions, onAdd, onRemove, onAddCompanion, onRemoveCompanion, onChooseArt, readOnly = false }: Props) {
  const [searching, setSearching] = useState<Searching>(null);
  const toggle = (what: Exclude<Searching, null>) => setSearching((current) => (current === what ? null : what));

  const first = commanders[0]?.card;
  const guide = first ? pairingGuide(first) : null;
  const pairing = commanders.length === 2 ? canPair(commanders[0].card, commanders[1].card) : null;

  const companion = companions[0]?.card;
  const companionRule = companion ? companionCondition(companion) : null;

  const card = (c: ScryfallCard, zone: ArtZone, remove: (id: string) => void | Promise<void>, note?: string | null) => {
    const img = cardImageUrl(c, "normal");
    return (
      <div key={c.id} className="flex w-32 shrink-0 flex-col gap-1">
        <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={c.name} className="w-full" />
          )}
        </div>
        {note && <p className="text-[11px] leading-snug text-black/50 dark:text-white/50">{note}</p>}
        {!readOnly && (
          <>
            <button onClick={() => onChooseArt(c, zone)} className={tileButtonClass("secondary")}>
              Choose art
            </button>
            <button onClick={() => remove(c.id)} className={tileButtonClass("secondary")}>
              Remove
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        {commanders.map(({ card: c }) => card(c, "commander", onRemove))}

        {!readOnly && commanders.length === 0 && (
          <button onClick={() => toggle("commander")} className={SLOT_CLASS} style={{ aspectRatio: "5/7" }}>
            <span className="text-xl">+</span>
            <span>Choose commander</span>
          </button>
        )}
        {!readOnly && commanders.length === 1 && guide && (
          <button onClick={() => toggle("partner")} className={SLOT_CLASS} style={{ aspectRatio: "5/7" }} title={guide.hint}>
            <span className="text-xl">+</span>
            <span>{guide.label}</span>
          </button>
        )}
      </div>

      {pairing?.ok && <p className="text-[11px] text-black/50 dark:text-white/50">Paired through {pairing.via}.</p>}
      {first && commanders.length === 1 && guide && <p className="text-[11px] text-black/50 dark:text-white/50">{pairingAbilities(first).map(describeAbility).join(" · ")}: {guide.hint}</p>}
      {!readOnly && first && commanders.length === 1 && !guide && (
        <p className="text-[11px] text-black/50 dark:text-white/50">
          {first.name} has no Partner, Background or similar ability.{" "}
          <button onClick={() => toggle("anyPartner")} className="underline hover:text-black dark:hover:text-white">
            Add a second commander anyway
          </button>
        </p>
      )}

      {searching === "commander" && (
        <CardSearch
          deckId={deckId}
          mode="commander"
          onAdd={async (c) => {
            await onAdd(c);
            setSearching(null);
          }}
        />
      )}
      {(searching === "partner" || searching === "anyPartner") && first && (
        <CardSearch
          deckId={deckId}
          mode="commander"
          partnerOf={searching === "partner" ? first.id : undefined}
          placeholder={searching === "partner" ? (guide?.search ?? "Search for a partner…") : "Search for a second commander by name…"}
          onAdd={async (c) => {
            await onAdd(c);
            setSearching(null);
          }}
        />
      )}

      {(companion || !readOnly) && (
        <div className="flex flex-col gap-2 border-t border-black/10 pt-3 dark:border-white/10">
          <h3 className="text-xs font-semibold text-black/60 dark:text-white/60">Companion</h3>
          {companion ? (
            <div className="flex gap-3">{card(companion, "companion", onRemoveCompanion, companionRule)}</div>
          ) : (
            <button onClick={() => toggle("companion")} className="self-start text-xs text-black/60 underline hover:text-black dark:text-white/60 dark:hover:text-white">
              + Add a companion
            </button>
          )}
          {!companion && <p className="text-[11px] text-black/40 dark:text-white/40">Sits outside the 100 cards. Only cards that fit your commander&apos;s colors are offered.</p>}
        </div>
      )}

      {searching === "companion" && (
        <CardSearch
          deckId={deckId}
          mode="companion"
          scope={searchScope(commanders.map((e) => e.card))}
          onAdd={async (c) => {
            await onAddCompanion(c);
            setSearching(null);
          }}
        />
      )}
    </div>
  );
}
