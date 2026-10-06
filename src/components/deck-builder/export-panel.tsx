"use client";

import { useState } from "react";
import { buildExport, EXPORT_FORMATS, type ExportFormat } from "@/lib/decklist-export";
import type { ResolvedDeck } from "./types";

export function ExportPanel({ deck }: { deck: ResolvedDeck }) {
  const [format, setFormat] = useState<ExportFormat>("text");
  const [copied, setCopied] = useState(false);
  const info = EXPORT_FORMATS.find((f) => f.value === format)!;
  const text = buildExport(deck, format);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([text], { type: info.extension === "csv" ? "text/csv" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deck.name.replace(/[^\w\- ]+/g, "").trim() || "deck"}.${info.extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-black/60 dark:text-white/60">Format</span>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
          className="rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-xs dark:border-white/15 dark:bg-black"
        >
          {EXPORT_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <span className="text-black/40 dark:text-white/40">{info.hint}</span>
      </label>
      <textarea readOnly value={text} rows={10} className="rounded-md border border-black/15 bg-black/[0.02] px-3 py-2 font-mono text-xs dark:border-white/15 dark:bg-white/[0.02]" />
      <div className="flex gap-2">
        <button onClick={copy} className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10">
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
        <button onClick={download} className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black">
          Download .{info.extension}
        </button>
      </div>
    </div>
  );
}
