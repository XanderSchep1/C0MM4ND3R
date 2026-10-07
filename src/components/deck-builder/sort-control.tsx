"use client";

import { directionLabel, SORT_KEYS, SORT_LABELS, withPrimary, withSecondary, type SortKey, type SortState } from "@/lib/deck-sort";

const SELECT = "rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/15 dark:bg-black";
const ARROW = "inline-flex items-center gap-1.5 rounded-md border border-black/15 px-2 py-1 font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10";

function Row({
  label,
  value,
  options,
  descending,
  onPick,
  onReverse,
}: {
  label: string;
  value: SortKey;
  options: readonly SortKey[];
  descending: boolean;
  onPick: (key: SortKey) => void;
  onReverse: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">
        <span className="w-14 font-medium">{label}</span>
        <select value={value} onChange={(e) => onPick(e.target.value as SortKey)} className={SELECT}>
          {options.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onReverse}
        title="Reverse the order"
        aria-label={`${label} order: ${directionLabel(value, descending)}. Click to reverse.`}
        className={ARROW}
      >
        <span aria-hidden="true">{descending ? "↓" : "↑"}</span>
        {directionLabel(value, descending)}
      </button>
    </div>
  );
}

// "Sort: [Card type ▾] [↑ Standard order]" and "Then by: [Mana value ▾] [↑ Lowest first]". The first picks the
// headings (or the one long list); the second orders the cards inside each heading. Picking a sort starts it
// in its natural direction; the arrows reverse.
export function SortControl({ sort, onChange }: { sort: SortState; onChange: (next: SortState) => void }) {
  return (
    <div className="flex flex-col gap-1.5 text-xs text-black/60 dark:text-white/60">
      <Row
        label="Sort"
        value={sort.key}
        options={SORT_KEYS}
        descending={sort.descending}
        onPick={(key) => onChange(withPrimary(sort, key))}
        onReverse={() => onChange({ ...sort, descending: !sort.descending })}
      />
      {/* Every card has its own name, so a second sort after "Name" would never change anything. */}
      {sort.key !== "name" && (
        <Row
          label="Then by"
          value={sort.then}
          options={SORT_KEYS.filter((key) => key !== sort.key)}
          descending={sort.thenDescending}
          onPick={(key) => onChange(withSecondary(sort, key))}
          onReverse={() => onChange({ ...sort, thenDescending: !sort.thenDescending })}
        />
      )}
      <span className="text-black/40 dark:text-white/40">Applies to the Mainboard and Maybeboard.</span>
    </div>
  );
}
