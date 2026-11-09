"use client";

import { useRef, useState } from "react";
import { buildKeywordClause } from "@/lib/search-query";
import { ClauseSearch } from "./clause-search";
import type { ScryfallCard, DeckZone } from "./types";

interface Props {
  deckId: string;
  onAdd: (card: ScryfallCard, zone: DeckZone) => void | Promise<void>;
  // The colours the deck's commander gives it (see searchScope). Lets the browser keep answers for a day.
  scope?: string;
  // Bump this number to focus the search box.
  focusSignal?: number;
  // How the result tiles are laid out; the default suits the narrow sidebar.
  gridClass?: string;
}

// Discovery by rules text: "what cards do X", by searching oracle text for a word or phrase.
export function KeywordSearch(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  return (
    <ClauseSearch
      {...props}
      term={term}
      onTermChange={setTerm}
      clause={buildKeywordClause(term)}
      inputRef={inputRef}
      placeholder="Search by keyword or ability… (e.g. flying, lifelink, draw a card)"
      label="Search cards by keyword"
      loadingText="Searching oracle text…"
      emptyText="No cards found using that keyword in your colors."
      resultsText={(typed) => `Suggested adds using "${typed.trim()}", sorted by Commander popularity:`}
    />
  );
}
