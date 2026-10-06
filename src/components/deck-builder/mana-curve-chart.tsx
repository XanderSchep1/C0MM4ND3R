"use client";

const BUCKETS = ["0", "1", "2", "3", "4", "5", "6+"];

// Single sequential hue (magnitude, not identity) — mana value already sits
// on the x-axis, so bar color doesn't need to re-encode it.
export function ManaCurveChart({ curve }: { curve: Record<string, number> }) {
  const max = Math.max(1, ...BUCKETS.map((b) => curve[b] ?? 0));

  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="mb-2 text-xs font-medium text-black/60 dark:text-white/60">Mana curve</div>
      <div className="flex h-28 items-end gap-2">
        {BUCKETS.map((bucket) => {
          const value = curve[bucket] ?? 0;
          const heightPct = value === 0 ? 0 : Math.max(6, (value / max) * 100);
          return (
            <div key={bucket} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-20 w-full items-end justify-center">
                <div
                  className="w-full max-w-[22px] rounded-t-[4px] bg-[#2a78d6] dark:bg-[#3987e5]"
                  style={{ height: `${heightPct}%` }}
                  title={`${value} at CMC ${bucket}`}
                />
              </div>
              <span className="text-[10px] tabular-nums text-black/50 dark:text-white/50">{value || ""}</span>
              <span className="text-[10px] text-black/40 dark:text-white/40">{bucket}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
