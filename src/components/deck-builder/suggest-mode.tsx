"use client";

import { createContext, useContext } from "react";

// True when the person looking at the deck is a friend invited to it. Their "Add" is a suggestion for the
// owner's Maybeboard, so the panels say "Suggest" and don't offer a separate "Maybe" button.
const SuggestModeContext = createContext(false);

export const SuggestModeProvider = SuggestModeContext.Provider;
export const useSuggesting = () => useContext(SuggestModeContext);
