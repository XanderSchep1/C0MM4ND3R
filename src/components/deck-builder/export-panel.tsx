"use client";

import { useState } from "react";
import { buildDecklistText } from "@/lib/decklist-export";
import type { ResolvedDeck } from "./types";

export function ExportPanel({ deck }: { deck: ResolvedDeck }) {
  const [copied, setCopied] = useState(false);
  const text = buildDecklistText(deck);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deck.name.replace(/[^\w\- ]+/g, "").trim() || "deck"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea readOnly value={text} rows={10} className="rounded-md border border-black/15 bg-black/[0.02] px-3 py-2 font-mono text-xs dark:border-white/15 dark:bg-white/[0.02]" />
      <div className="flex gap-2">
        <button onClick={copy} className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10">
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
        <button onClick={download} className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black">
          Download .txt
        </button>
      </div>
    </div>
  );
}
