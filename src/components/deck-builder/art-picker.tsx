"use client";

import { useEffect, useRef, useState } from "react";
import { cardImageUrl, formatPrice } from "@/lib/card-helpers";
import { cheapestPrinting, printingLabel } from "@/lib/printings";
import type { ScryfallCard } from "./types";

interface Props {
  // The card as it is in the deck now (its current printing).
  card: ScryfallCard;
  onPick: (printing: ScryfallCard) => void;
  onClose: () => void;
}

type View = "art" | "prints";

// "Choose art": every printing of one card as a picture grid. "Different art" shows one printing per
// distinct illustration (the usual way to browse); "Every printing" shows each set's version, which is
// what matters if you're choosing for price or for a particular frame.
export function ArtPicker({ card, onPick, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const oracleId = card.oracle_id;
  const [view, setView] = useState<View>("art");
  const [printings, setPrintings] = useState<ScryfallCard[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(oracleId));
  const [error, setError] = useState<string | null>(null);

  // A native <dialog> gives us the dark backdrop, focus trapping and Esc-to-close for free. There is
  // deliberately no cleanup that calls close(): that fires a "close" event, which would tell the page
  // to remove the picker the moment React's development mode remounts it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (!oracleId) return;
    const controller = new AbortController();
    fetch(`/api/cards/printings?oracleId=${oracleId}&unique=${view}&page=${page}`, { signal: controller.signal })
      .then(async (res) => ({ res, data: await res.json().catch(() => null) }))
      .then(({ res, data }) => {
        if (!res.ok || !data) {
          setError(data?.error ?? "Couldn't load the printings. Try again.");
          return;
        }
        setPrintings((prev) => (page === 1 ? data.cards : [...prev, ...data.cards]));
        setHasMore(Boolean(data.hasMore));
        setTotal(data.totalCards ?? null);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setError("Couldn't load the printings. Try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [oracleId, view, page]);

  function switchView(next: View) {
    if (next === view) return;
    setView(next);
    setPage(1);
    setPrintings([]);
    setHasMore(false);
    setError(null);
    setLoading(true);
  }

  const cheapest = cheapestPrinting(printings);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // A click on the dimmed backdrop (which belongs to the dialog itself) closes it.
        if (e.target === dialogRef.current) onClose();
      }}
      aria-label={`Choose art for ${card.name}`}
      className="m-auto w-[min(920px,94vw)] max-h-[90vh] overflow-y-auto rounded-xl border border-black/20 bg-white p-4 text-black shadow-2xl backdrop:bg-black/60 dark:border-white/25 dark:bg-neutral-900 dark:text-white"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Choose art for {card.name}</h2>
          <p className="text-xs text-black/50 dark:text-white/50">
            Now: {printingLabel(card)} · {formatPrice(card)}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md border border-black/20 px-3 py-1.5 text-xs font-semibold hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10">
          Close ✕
        </button>
      </div>

      {!oracleId ? (
        <p className="mt-4 text-sm text-black/60 dark:text-white/60">Art choices aren&apos;t available for this card.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <div role="group" aria-label="What to show" className="inline-flex overflow-hidden rounded-md border border-black/20 dark:border-white/25">
              {(
                [
                  ["art", "Different art"],
                  ["prints", "Every printing"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => switchView(value)}
                  className={`px-3 py-1.5 font-semibold ${view === value ? "bg-black text-white dark:bg-white dark:text-black" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!cheapest || cheapest.id === card.id}
              onClick={() => cheapest && onPick(cheapest)}
              title="Switch to the least expensive printing in the list"
              className="rounded-md border border-black/20 px-3 py-1.5 font-semibold hover:bg-black/5 disabled:opacity-40 dark:border-white/25 dark:hover:bg-white/10"
            >
              Use the cheapest{cheapest ? ` (${formatPrice(cheapest)})` : ""}
            </button>
            <span className="text-black/50 dark:text-white/50" aria-live="polite">
              {loading && printings.length === 0 ? "Loading…" : total !== null ? `${total} ${view === "art" ? "different arts" : "printings"}` : ""}
            </span>
          </div>

          {error && <p className="mt-3 text-xs text-[#d03b3b]">{error}</p>}

          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {printings.map((p) => {
              const img = cardImageUrl(p, "normal") ?? cardImageUrl(p, "small");
              const current = p.id === card.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => (current ? onClose() : onPick(p))}
                    aria-label={`${printingLabel(p)}, ${formatPrice(p)}${current ? " (current)" : ""}`}
                    className={`flex w-full flex-col gap-1 rounded-lg border p-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 ${
                      current ? "border-[#2a78d6] ring-2 ring-[#2a78d6]" : "border-black/15 dark:border-white/20"
                    }`}
                  >
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt="" loading="lazy" className="aspect-[5/7] w-full rounded-[6px] object-cover" />
                    ) : (
                      <div className="flex aspect-[5/7] w-full items-center justify-center rounded-[6px] bg-black/5 text-[10px] dark:bg-white/5">{p.name}</div>
                    )}
                    <span className="truncate px-0.5 text-[11px] font-medium">{printingLabel(p)}</span>
                    <span className="flex items-center justify-between px-0.5 text-[11px] text-black/60 dark:text-white/60">
                      <span>#{p.collector_number}</span>
                      <span className="font-semibold tabular-nums">{formatPrice(p)}</span>
                    </span>
                    {current && <span className="px-0.5 text-[10px] font-semibold uppercase text-[#2a78d6]">Current</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                setPage((n) => n + 1);
              }}
              className="mt-3 rounded-md border border-black/20 px-3 py-1.5 text-xs font-semibold hover:bg-black/5 disabled:opacity-40 dark:border-white/25 dark:hover:bg-white/10"
            >
              {loading ? "Loading…" : "Show more"}
            </button>
          )}
        </>
      )}
    </dialog>
  );
}
