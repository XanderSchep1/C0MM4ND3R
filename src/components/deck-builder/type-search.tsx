"use client";

import { useRef, useState } from "react";
import { pickType, suggestTypes } from "@/lib/creature-types";
import { buildTypeClause } from "@/lib/search-query";
import { ClauseSearch } from "./clause-search";
import type { ScryfallCard, DeckZone } from "./types";

interface Props {
  deckId: string;
  onAdd: (card: ScryfallCard, zone: DeckZone) => void | Promise<void>;
  scope?: string;
  focusSignal?: number;
  gridClass?: string;
}

// Discovery by creature type: type Elf, Goblin or Zombie (or two, "elf warrior") and get the cards of that tribe
// in your colors. The creature types themselves come up as quick picks while you type.
export function TypeSearch(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [changelings, setChangelings] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const asked = useRef(false);

  // The list of types is fetched the first time the box is used, not with every deck page.
  function loadTypes() {
    if (asked.current) return;
    asked.current = true;
    fetch("/api/scryfall/creature-types")
      .then((r) => r.json())
      .then((data) => {
        const list: string[] = Array.isArray(data.types) ? data.types : [];
        setTypes(list);
        if (list.length === 0) asked.current = false; // Scryfall didn't answer: try again next time the box is used
      })
      .catch(() => {
        asked.current = false;
      });
  }

  const picks = suggestTypes(types, term);

  return (
    <ClauseSearch
      {...props}
      term={term}
      onTermChange={setTerm}
      clause={buildTypeClause(term, { changelings })}
      inputRef={inputRef}
      onInputFocus={loadTypes}
      placeholder="Search by creature type… (e.g. elf, goblin, zombie)"
      label="Search cards by creature type"
      loadingText="Searching by type…"
      emptyText="No cards of that type in your colors."
      resultsText={(typed) => `Suggested ${typed.trim()} cards, sorted by Commander popularity:`}
    >
      {picks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-black/40 dark:text-white/40">Types</span>
          {picks.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setTerm(pickType(term, type));
                inputRef.current?.focus({ preventScroll: true });
              }}
              className="rounded-full border border-black/15 px-2 py-0.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              {type}
            </button>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
        <input type="checkbox" checked={changelings} onChange={(e) => setChangelings(e.target.checked)} />
        <span>
          Include Changelings <span className="text-black/40 dark:text-white/40">(they count as every creature type)</span>
        </span>
      </label>
    </ClauseSearch>
  );
}
