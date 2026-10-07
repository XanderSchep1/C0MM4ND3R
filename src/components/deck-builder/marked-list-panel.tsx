"use client";

import { useRef, useState } from "react";
import { priceValue } from "@/lib/card-helpers";
import { buildCardList, CARD_LIST_FORMATS, type CardListFormat } from "@/lib/decklist-export";
import type { DeckCardEntry } from "./types";

interface Props {
  title: string;
  swatch: string;
  entries: DeckCardEntry[];
  fileName: string;
  onClose: () => void;
}

// The cards you've highlighted yellow (owned) or red (missing), as a list you can copy or download:
// paste the red ones into a store's mass-entry box, or the yellow ones into a trade binder.
export function MarkedListPanel({ title, swatch, entries, fileName, onClose }: Props) {
  const [format, setFormat] = useState<CardListFormat>("text");
  const [feedback, setFeedback] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const info = CARD_LIST_FORMATS.find((f) => f.value === format)!;
  const text = buildCardList(entries, format);

  const copies = entries.reduce((sum, e) => sum + e.quantity, 0);
  const priced = entries.map((e) => ({ price: priceValue(e.card), quantity: e.quantity }));
  const total = priced.reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0);
  const unpriced = priced.filter((p) => p.price === null).length;

  function say(message: string) {
    setFeedback(message);
    setTimeout(() => setFeedback(null), 2500);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      say(`Copied ${entries.length} card${entries.length === 1 ? "" : "s"}`);
    } catch {
      // Clipboard access can be blocked (e.g. on an insecure page); leave the text selected for Ctrl/Cmd+C.
      textRef.current?.focus();
      textRef.current?.select();
      say("Press Ctrl/Cmd+C to copy");
    }
  }

  function download() {
    const blob = new Blob([text], { type: info.extension === "csv" ? "text/csv" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(/[^\w\- ]+/g, "").trim() || "cards"}.${info.extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-label={title} className="flex flex-col gap-2 rounded-md border border-black/15 p-3 dark:border-white/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className={`h-3 w-3 rounded-full ${swatch}`} aria-hidden="true" />
          {title}
          <span className="text-xs font-normal text-black/50 dark:text-white/50">
            {entries.length} card{entries.length === 1 ? "" : "s"}
            {copies !== entries.length ? ` (${copies} copies)` : ""} · about ${total.toFixed(2)}
            {unpriced > 0 ? ` + ${unpriced} unpriced` : ""}
          </span>
        </div>
        <button type="button" onClick={onClose} className="rounded px-1.5 text-xs text-black/50 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10" aria-label={`Close ${title}`}>
          Close ×
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-black/50 dark:text-white/50">No cards are marked this way yet. Use the highlight button on a card line.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-2">
              <span className="font-medium text-black/60 dark:text-white/60">Format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as CardListFormat)}
                className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/15 dark:bg-black"
              >
                {CARD_LIST_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={copy} className="rounded-md bg-black px-3 py-1.5 font-semibold text-white dark:bg-white dark:text-black">
              Copy list
            </button>
            <button type="button" onClick={download} className="rounded-md border border-black/25 px-3 py-1.5 font-semibold hover:bg-black/5 dark:border-white/30 dark:hover:bg-white/10">
              Download
            </button>
            <span role="status" aria-live="polite" className="font-medium text-[#0b7a0b] dark:text-[#3fd13f]">
              {feedback ? `✓ ${feedback}` : ""}
            </span>
          </div>
          <p className="text-[11px] text-black/40 dark:text-white/40">{info.hint}</p>
          <textarea
            ref={textRef}
            readOnly
            value={text}
            rows={Math.min(10, entries.length + 1)}
            aria-label={`${title} as text`}
            className="w-full resize-y rounded-md border border-black/15 bg-transparent p-2 font-mono text-xs dark:border-white/15"
          />
        </>
      )}
    </section>
  );
}
