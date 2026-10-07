"use client";

import { directionLabel, SORT_KEYS, SORT_LABELS, sortFor, type SortKey, type SortState } from "@/lib/deck-sort";

// "Sort: [Card type ▾] [Standard order ↑]" — the select picks what to sort by (starting in that
// sort's natural direction); the button flips the direction.
export function SortControl({ sort, onChange }: { sort: SortState; onChange: (next: SortState) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-black/60 dark:text-white/60">
      <label className="flex items-center gap-2">
        <span className="font-medium">Sort</span>
        <select
          value={sort.key}
          onChange={(e) => onChange(sortFor(e.target.value as SortKey))}
          className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/15 dark:bg-black"
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => onChange({ ...sort, descending: !sort.descending })}
        title="Reverse the order"
        aria-label={`Order: ${directionLabel(sort)}. Click to reverse.`}
        className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-2 py-1 font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      >
        <span aria-hidden="true">{sort.descending ? "↓" : "↑"}</span>
        {directionLabel(sort)}
      </button>
      <span className="text-black/40 dark:text-white/40">Applies to the Mainboard and Maybeboard.</span>
    </div>
  );
}
