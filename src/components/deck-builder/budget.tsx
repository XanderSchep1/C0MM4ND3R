"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { priceValue } from "@/lib/card-helpers";
import type { ScryfallCard } from "./types";

const STORAGE_KEY = "budget-max-price";
export const BUDGET_OPTIONS = [1, 2, 5, 10, 25, 50, 100];

interface Budget {
  max: number | null;
  setMax: (value: number | null) => void;
  // Cards with no known price pass: they're usually brand new, and hiding them
  // would hide exactly the cards people want to see.
  inBudget: (card: ScryfallCard) => boolean;
}

const BudgetContext = createContext<Budget>({ max: null, setMax: () => {}, inBudget: () => true });

export function BudgetProvider({ children }: { children: ReactNode }) {
  const [max, setMaxState] = useState<number | null>(null);

  // Restore the saved budget after mount (reading storage during render would
  // mismatch the server-rendered HTML).
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = Number(localStorage.getItem(STORAGE_KEY));
        if (saved > 0) setMaxState(saved);
      } catch {
        // Storage can be blocked (private windows); the budget just won't persist.
      }
    });
  }, []);

  function setMax(value: number | null) {
    setMaxState(value);
    try {
      if (value === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // See above.
    }
  }

  const inBudget = (card: ScryfallCard) => {
    if (max === null) return true;
    const price = priceValue(card);
    return price === null || price <= max;
  };

  return <BudgetContext.Provider value={{ max, setMax, inBudget }}>{children}</BudgetContext.Provider>;
}

export function useBudget(): Budget {
  return useContext(BudgetContext);
}

export function BudgetControl() {
  const { max, setMax } = useBudget();
  return (
    <label className="mb-2 flex flex-wrap items-center gap-2 text-xs text-black/60 dark:text-white/60">
      <span className="font-medium">Budget</span>
      <select
        value={max ?? ""}
        onChange={(e) => setMax(e.target.value ? Number(e.target.value) : null)}
        className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/15 dark:bg-black"
      >
        <option value="">No limit</option>
        {BUDGET_OPTIONS.map((n) => (
          <option key={n} value={n}>
            Up to ${n} per card
          </option>
        ))}
      </select>
      {max !== null && <span className="text-black/40 dark:text-white/40">Cards over ${max} are hidden in suggestions and search.</span>}
    </label>
  );
}
