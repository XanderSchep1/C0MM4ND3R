"use client";

import { ColorPips } from "./color-pips";
import { ManaCurveChart } from "./mana-curve-chart";
import type { DeckAnalysis, PowerLevelEstimate, PriceTotal } from "./types";

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function StatsPanel({
  colorIdentity,
  analysis,
  powerLevel,
  priceTotal,
  expensive,
}: {
  colorIdentity: string[];
  analysis: DeckAnalysis;
  powerLevel: PowerLevelEstimate;
  priceTotal: PriceTotal;
  expensive: { name: string; price: number }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-black/60 dark:text-white/60">Color identity</span>
        <ColorPips identity={colorIdentity} />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-black/60 dark:text-white/60">Lands</span>
        <span className="tabular-nums">
          {analysis.landCount} / {analysis.landTarget}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-black/60 dark:text-white/60">Estimated price</span>
        <span className="tabular-nums" title={priceTotal.unpricedCount > 0 ? `${priceTotal.unpricedCount} card(s) have no known price` : undefined}>
          {formatUsd(priceTotal.usd)}
          {priceTotal.unpricedCount > 0 && <span className="text-black/40 dark:text-white/40"> +{priceTotal.unpricedCount} unpriced</span>}
        </span>
      </div>

      {expensive.length > 0 && (
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="font-medium text-black/60 dark:text-white/60">Most expensive cards</span>
          {expensive.map((c) => (
            <div key={c.name} className="flex items-center justify-between gap-2">
              <span className="truncate text-black/70 dark:text-white/70">{c.name}</span>
              <span className="shrink-0 tabular-nums">{formatUsd(c.price)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border border-black/10 p-2.5 text-xs dark:border-white/10">
        <div className="flex items-center justify-between">
          <span className="font-medium text-black/60 dark:text-white/60">Power level (est.)</span>
          <span className="rounded-full bg-black/5 px-2 py-0.5 font-semibold dark:bg-white/10">
            Bracket {powerLevel.bracket} · {powerLevel.label}
          </span>
        </div>
        <p className="mt-1 text-black/50 dark:text-white/50">{powerLevel.description}</p>
        {powerLevel.gameChangers.count > 0 && (
          <p className="mt-1 text-black/40 dark:text-white/40">{powerLevel.gameChangers.cards.map((c) => c.name).join(", ")}</p>
        )}
      </div>

      <ManaCurveChart curve={analysis.curve} />

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-black/60 dark:text-white/60">Deck composition</span>
        {analysis.themes.map((theme) => {
          const pct = Math.min(100, (theme.count / theme.target) * 100);
          return (
            <div key={theme.key} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-black/60 dark:text-white/60">{theme.label}</span>
              <div className="h-1.5 flex-1 rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-1.5 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right tabular-nums text-black/50 dark:text-white/50">
                {theme.count}/{theme.target}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
