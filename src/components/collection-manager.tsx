"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface OwnedRow {
  name: string;
  nameKey: string;
  quantity: number;
  usd: number | null;
}

interface CollectionData {
  cards: OwnedRow[];
  unique: number;
  total: number;
  pricedCount: number;
  value: number;
}

type SortMode = "name" | "quantity" | "price";
const PAGE_SIZE = 150;

const money = (n: number) => `$${n.toFixed(2)}`;

export function CollectionManager() {
  const [data, setData] = useState<CollectionData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const [text, setText] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/collection?view=full");
      if (!res.ok) throw new Error();
      setData(await res.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/collection?view=full")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = q ? data.cards.filter((c) => c.nameKey.includes(q)) : [...data.cards];
    if (sort === "quantity") filtered.sort((a, b) => b.quantity - a.quantity || a.nameKey.localeCompare(b.nameKey));
    else if (sort === "price") filtered.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || a.nameKey.localeCompare(b.nameKey));
    return filtered;
  }, [data, query, sort]);

  function recompute(cards: OwnedRow[]): CollectionData {
    const priced = cards.filter((c) => c.usd !== null);
    return {
      cards,
      unique: cards.length,
      total: cards.reduce((s, c) => s + c.quantity, 0),
      pricedCount: priced.length,
      value: Math.round(priced.reduce((s, c) => s + (c.usd ?? 0) * c.quantity, 0) * 100) / 100,
    };
  }

  async function setQuantity(row: OwnedRow, quantity: number) {
    if (!data) return;
    const next = quantity <= 0 ? data.cards.filter((c) => c.nameKey !== row.nameKey) : data.cards.map((c) => (c.nameKey === row.nameKey ? { ...c, quantity } : c));
    setData(recompute(next));
    const res = await fetch("/api/collection", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nameKey: row.nameKey, quantity }) });
    if (!res.ok) await load();
  }

  async function removeRow(row: OwnedRow) {
    if (!data) return;
    setData(recompute(data.cards.filter((c) => c.nameKey !== row.nameKey)));
    const res = await fetch(`/api/collection?nameKey=${encodeURIComponent(row.nameKey)}`, { method: "DELETE" });
    if (!res.ok) await load();
  }

  async function importList() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mode }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ ok: false, text: body?.error ?? "Couldn't import that list." });
        return;
      }
      setMessage({ ok: true, text: `Imported ${body.imported} different cards. You now own ${body.unique} different cards (${body.total} total).` });
      setText("");
      await load();
    } catch {
      setMessage({ ok: false, text: "Couldn't import that list." });
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!confirm("Remove every card from your collection? Your decks are not affected.")) return;
    setBusy(true);
    try {
      await fetch("/api/collection", { method: "DELETE" });
      setMessage({ ok: true, text: "Collection cleared." });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const listText = () => (data?.cards ?? []).map((c) => `${c.quantity} ${c.name}`).join("\n") + "\n";

  async function copyList() {
    await navigator.clipboard.writeText(listText());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadList() {
    const url = URL.createObjectURL(new Blob([listText()], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "collection.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const buttonClass = "rounded-md border border-black/20 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/25 dark:hover:bg-white/10";

  return (
    <div className="flex flex-col gap-6">
      {loadError && <p className="text-sm text-[#d03b3b]">Couldn&apos;t load your collection. Refresh to try again.</p>}

      <div className="grid grid-cols-3 gap-3">
        {[
          ["Different cards", data ? String(data.unique) : "…"],
          ["Total cards", data ? String(data.total) : "…"],
          ["Estimated value", data ? money(data.value) : "…"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="text-xs text-black/50 dark:text-white/50">{label}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      {data && data.unique > 0 && data.pricedCount < data.unique && (
        <p className="-mt-3 text-[11px] text-black/40 dark:text-white/40">
          Value counts the {data.pricedCount} of {data.unique} cards whose prices the app already knows; open them in a deck or search to add the rest.
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <div>
          <h2 className="text-sm font-semibold">Add cards</h2>
          <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">
            Paste any list with one card per line (<span className="font-mono">1 Sol Ring</span>). Exports from Moxfield, Archidekt, Deckbox and TCGplayer all work.
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"1 Sol Ring\n1 Arcane Signet\n4 Lightning Bolt"}
          className="rounded-md border border-black/15 px-3 py-2 font-mono text-xs dark:border-white/15 dark:bg-black"
        />
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} /> Add to my collection
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace my whole collection
          </label>
        </div>
        {message && <p className={`text-xs ${message.ok ? "text-[#0b7a0b] dark:text-[#3fd13f]" : "text-[#d03b3b]"}`}>{message.text}</p>}
        <button
          onClick={importList}
          disabled={busy || !text.trim()}
          className="self-start rounded-md bg-black px-4 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {busy ? "Working…" : "Import list"}
        </button>
      </section>

      {data && data.unique === 0 && !loadError && (
        <p className="rounded-lg border border-dashed border-black/20 p-6 text-center text-sm text-black/50 dark:border-white/20 dark:text-white/50">
          Your collection is empty. Paste a list above to get started.
        </p>
      )}

      {data && data.unique > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(PAGE_SIZE);
              }}
              placeholder="Search your collection…"
              className="min-w-0 flex-1 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-black"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-xs dark:border-white/15 dark:bg-black"
            >
              <option value="name">Sort: name</option>
              <option value="quantity">Sort: most copies</option>
              <option value="price">Sort: price</option>
            </select>
            <button onClick={copyList} className={buttonClass}>
              {copied ? "Copied!" : "Copy list"}
            </button>
            <button onClick={downloadList} className={buttonClass}>
              Download .txt
            </button>
            <button onClick={clearAll} disabled={busy} className={buttonClass}>
              Clear all
            </button>
          </div>

          <p className="text-xs text-black/50 dark:text-white/50">
            {query ? `${rows.length} of ${data.unique} cards match` : `${data.unique} cards`}
          </p>

          <ul className="flex flex-col divide-y divide-black/5 rounded-lg border border-black/10 dark:divide-white/5 dark:border-white/10">
            {rows.slice(0, visible).map((row) => (
              <li key={row.nameKey} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setQuantity(row, row.quantity - 1)}
                    className="h-6 w-6 rounded border border-black/15 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    aria-label={`One fewer ${row.name}`}
                  >
                    −
                  </button>
                  <span className="w-7 text-center tabular-nums">{row.quantity}</span>
                  <button
                    onClick={() => setQuantity(row, row.quantity + 1)}
                    className="h-6 w-6 rounded border border-black/15 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    aria-label={`One more ${row.name}`}
                  >
                    +
                  </button>
                </div>
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-black/50 dark:text-white/50">
                  {row.usd === null ? "—" : row.quantity > 1 ? `${money(row.usd)} × ${row.quantity}` : money(row.usd)}
                </span>
                <button
                  onClick={() => removeRow(row)}
                  className="shrink-0 rounded border border-black/15 px-1.5 py-0.5 text-[10px] text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/10"
                  aria-label={`Remove ${row.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {rows.length > visible && (
            <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className={`self-center ${buttonClass}`}>
              Show {Math.min(PAGE_SIZE, rows.length - visible)} more ({rows.length - visible} left)
            </button>
          )}
        </section>
      )}
    </div>
  );
}
