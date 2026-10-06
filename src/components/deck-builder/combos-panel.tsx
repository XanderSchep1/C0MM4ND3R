"use client";

import { useState } from "react";
import { NameWithPreview } from "./card-hover-name";

interface ComboCardRef {
  oracleId: string;
  name: string;
  imageUri?: string;
  price?: string;
}
interface ComboVariant {
  id: string;
  cards: ComboCardRef[];
  produces: string[];
  popularity: number;
  description: string;
}
interface MissingCardRef extends ComboCardRef {
  scryfallId: string | null;
}
interface ComboOpportunity {
  variant: ComboVariant;
  missing: MissingCardRef[];
}

interface Props {
  deckId: string;
  hasCommander: boolean;
  onAdd: (scryfallId: string) => void | Promise<void>;
}

export function CombosPanel({ deckId, hasCommander, onAdd }: Props) {
  const [complete, setComplete] = useState<ComboVariant[] | null>(null);
  const [near, setNear] = useState<ComboOpportunity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/combos`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "Couldn't search for combos. Try again.");
        return;
      }
      setComplete(data.complete);
      setNear(data.near);
    } catch {
      setError("Couldn't search for combos. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(scryfallId: string) {
    setAddingId(scryfallId);
    try {
      await onAdd(scryfallId);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={search}
        disabled={!hasCommander || loading}
        className="self-start rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {loading ? "Searching Commander Spellbook…" : complete ? "Refresh combos" : "Find combos"}
      </button>
      {!hasCommander && <p className="text-xs text-black/40 dark:text-white/40">Pick a commander first.</p>}
      {error && <p className="text-xs text-[#d03b3b]">{error}</p>}
      <p className="text-[11px] text-black/40 dark:text-white/40">
        Powered by{" "}
        <a href="https://commanderspellbook.com" target="_blank" rel="noreferrer" className="underline">
          Commander Spellbook
        </a>
        .
      </p>

      {complete && complete.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-semibold text-[#0ca30c]">Combos already in your deck</div>
          <div className="flex flex-col gap-2">
            {complete.map((v) => (
              <div key={v.id} className="rounded-md border border-[#0ca30c]/30 bg-[#0ca30c]/5 p-2 text-xs">
                <div className="font-medium">
                  {v.cards.map((c, i) => (
                    <span key={c.oracleId}>
                      {i > 0 && " + "}
                      <NameWithPreview name={c.name} imageUri={c.imageUri} price={c.price} />
                    </span>
                  ))}
                </div>
                <div className="text-black/50 dark:text-white/50">→ {v.produces.join(", ")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {near && near.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-semibold">You&apos;re close</div>
          <div className="flex flex-col gap-2">
            {near.map(({ variant, missing }) => (
              <div key={variant.id} className="rounded-md border border-black/10 p-2 text-xs dark:border-white/10">
                <div>
                  {variant.cards.map((c, i) => (
                    <span key={c.oracleId}>
                      {i > 0 && " + "}
                      <NameWithPreview
                        name={c.name}
                        imageUri={c.imageUri}
                        price={c.price}
                        className={missing.some((m) => m.oracleId === c.oracleId) ? "font-semibold text-[#2a78d6] dark:text-[#3987e5]" : ""}
                      />
                    </span>
                  ))}
                </div>
                <div className="text-black/50 dark:text-white/50">→ {variant.produces.join(", ")}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {missing.map((m) =>
                    m.scryfallId ? (
                      <button
                        key={m.oracleId}
                        onClick={() => handleAdd(m.scryfallId!)}
                        disabled={addingId === m.scryfallId}
                        className="rounded border border-black/15 px-2 py-1 text-[11px] font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
                      >
                        + Add {m.name}
                      </button>
                    ) : (
                      <span key={m.oracleId} className="text-[11px] text-black/40 dark:text-white/40">
                        {m.name} (not found)
                      </span>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {complete && complete.length === 0 && near && near.length === 0 && (
        <p className="text-xs text-black/40 dark:text-white/40">No known combos found for the cards in this deck yet.</p>
      )}
    </div>
  );
}
