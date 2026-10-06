"use client";

import { useState } from "react";

interface Props {
  onImport: (text: string, mode: "merge" | "replace") => Promise<{ added: number; unresolved: string[] } | { error: string }>;
}

export function ImportPanel({ onImport }: Props) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; unresolved: string[] } | { error: string } | null>(null);

  async function handleImport() {
    if (!text.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await onImport(text, mode);
      setResult(res);
      if (!("error" in res)) setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"Paste a decklist, e.g.\n1 Sol Ring\n1 Arcane Signet\nCommander\n1 Atraxa, Praetors' Voice"}
        className="rounded-md border border-black/15 px-3 py-2 font-mono text-xs dark:border-white/15 dark:bg-black"
      />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
          <input type="checkbox" checked={mode === "replace"} onChange={(e) => setMode(e.target.checked ? "replace" : "merge")} />
          Replace deck instead of merging
        </label>
        <button
          onClick={handleImport}
          disabled={busy || !text.trim()}
          className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
      {result && "error" in result && <p className="text-xs text-[#d03b3b]">{result.error}</p>}
      {result && "added" in result && (
        <div className="text-xs text-black/60 dark:text-white/60">
          <p>Added {result.added} card{result.added === 1 ? "" : "s"}.</p>
          {result.unresolved.length > 0 && (
            <p className="mt-1 text-[#8a5a00] dark:text-[#fab219]">Couldn&apos;t match: {result.unresolved.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
