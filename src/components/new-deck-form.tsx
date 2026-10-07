"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function NewDeckForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't create that deck. Try again.");
        return;
      }
      const { deck } = await res.json();
      router.push(`/decks/${deck.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New deck name…"
        className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
      />
      <button
        type="submit"
        disabled={isPending || !name.trim()}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {isPending ? "Creating…" : "Create deck"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
