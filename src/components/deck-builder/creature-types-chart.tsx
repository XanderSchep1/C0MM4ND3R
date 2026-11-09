import type { CreatureTypeCount } from "@/lib/deck-analysis";

// How many types to list; a deck with a tribe has a clear top few, and the long tail only adds noise.
const SHOWN = 8;

// Same single hue as the mana curve: the bar says how many, the label says which type.
export function CreatureTypesChart({ types }: { types: CreatureTypeCount[] }) {
  const shown = types.slice(0, SHOWN);
  const more = types.length - shown.length;
  const max = Math.max(1, ...shown.map((t) => t.count));

  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="mb-2 text-xs font-medium text-black/60 dark:text-white/60">Creature types</div>
      {shown.length === 0 ? (
        <p className="text-xs text-black/40 dark:text-white/40">No creatures yet.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {shown.map(({ type, count }) => (
              <li key={type} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 truncate text-black/60 dark:text-white/60">{type}</span>
                <div className="h-1.5 flex-1 rounded-full bg-black/10 dark:bg-white/10">
                  <div className="h-1.5 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${(count / max) * 100}%` }} />
                </div>
                <span className="w-6 shrink-0 text-right tabular-nums text-black/50 dark:text-white/50">{count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-black/40 dark:text-white/40">
            {more > 0 && `+ ${more} more ${more === 1 ? "type" : "types"}. `}A creature with two types counts for both.
          </p>
        </>
      )}
    </div>
  );
}
