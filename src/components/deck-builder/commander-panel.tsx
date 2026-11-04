"use client";

import { useState } from "react";
import { cardImageUrl } from "@/lib/card-helpers";
import { canPair, pairingGuides } from "@/lib/commander-pairs";
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

// Which search is open: the first commander, the second one ("Add secondary"), or the companion.
type Searching = "commander" | "secondary" | "companion" | null;

const SLOT_CLASS =
  "flex w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-black/20 p-2 text-center text-xs text-black/50 hover:border-black/40 dark:border-white/20 dark:text-white/50 dark:hover:border-white/40";

const chipClass = (selected: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium ${
    selected
      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
      : "border-black/20 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
  }`;

export function CommanderPanel({ deckId, commanders, companions, onAdd, onRemove, onAddCompanion, onRemoveCompanion, onChooseArt, readOnly = false }: Props) {
  const [searching, setSearching] = useState<Searching>(null);
  // What kind of second commander is being looked for: one of the first commander's pairing kinds, "any" (not
  // limited to what it can pair with), or null until one is picked.
  const [via, setVia] = useState<string | null>(null);

  const first = commanders[0]?.card;
  const guides = first ? pairingGuides(first) : [];
  const chosen = guides.find((g) => g.kind === via);
  const pairing = commanders.length === 2 ? canPair(commanders[0].card, commanders[1].card) : null;

  const companion = companions[0]?.card;
  const companionRule = companion ? companionCondition(companion) : null;

  const toggle = (what: Exclude<Searching, null>) => {
    if (what === "secondary" && searching !== "secondary") {
      // A commander nothing can pair with has only "any" to offer, so go straight to it.
      setVia(guides.length === 0 ? "any" : null);
    }
    setSearching((current) => (current === what ? null : what));
  };

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
        {!readOnly && commanders.length === 1 && (
          <button
            onClick={() => toggle("secondary")}
            aria-expanded={searching === "secondary"}
            className={SLOT_CLASS}
            style={{ aspectRatio: "5/7" }}
            title="A second commander: a partner, a Background, a Doctor..."
          >
            <span className="text-xl">+</span>
            <span>Add secondary</span>
          </button>
        )}
      </div>

      {pairing?.ok && <p className="text-[11px] text-black/50 dark:text-white/50">Paired through {pairing.via}.</p>}

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

      {searching === "secondary" && first && (
        <div className="flex flex-col gap-2 rounded-md border border-black/10 p-3 dark:border-white/15">
          <p className="text-xs font-medium">What should {first.name} be paired with?</p>
          <div role="radiogroup" aria-label="Kind of second commander" className="flex flex-wrap gap-1.5">
            {guides.map((g) => (
              <button key={g.kind} role="radio" aria-checked={via === g.kind} onClick={() => setVia(g.kind)} className={chipClass(via === g.kind)}>
                {g.option}
              </button>
            ))}
            <button role="radio" aria-checked={via === "any"} onClick={() => setVia("any")} className={chipClass(via === "any")}>
              Any commander
            </button>
          </div>
          <p className="text-[11px] text-black/50 dark:text-white/50">
            {via === "any"
              ? guides.length === 0
                ? `${first.name} has no Partner, Background or similar ability, so by the rules nothing pairs with it. You can still pick one; the deck will show an error.`
                : "Not limited to what the rules allow: the deck will show an error if the two can't be paired."
              : (chosen?.hint ?? "Pick what kind of second commander this deck should have.")}
          </p>
        </div>
      )}
      {searching === "secondary" && first && via && (
        <CardSearch
          key={via}
          deckId={deckId}
          mode="commander"
          partnerOf={via === "any" ? undefined : first.id}
          partnerVia={via === "any" ? undefined : via}
          placeholder={chosen?.search ?? "Search for a second commander by name…"}
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
