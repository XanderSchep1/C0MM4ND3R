"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CommanderPanel } from "./commander-panel";
import { ValidationBanner } from "./validation-banner";
import { StatsPanel } from "./stats-panel";
import { CardSearch } from "./card-search";
import { KeywordSearch } from "./keyword-search";
import { ImportPanel } from "./import-panel";
import { ExportPanel } from "./export-panel";
import { SuggestionsPanel } from "./suggestions-panel";
import { SynergiesPanel } from "./synergies-panel";
import { CombosPanel } from "./combos-panel";
import { SaltPanel } from "./salt-panel";
import { SimulatePanel } from "./simulate-panel";
import { NewCardsPanel } from "./new-cards-panel";
import { ReplacementsPanel } from "./replacements-panel";
import { LandsPanel } from "./lands-panel";
import { PlaytestPanel } from "./playtest-panel";
import { CollectionProvider, ToBuySummary } from "./collection";
import { BudgetControl, BudgetProvider } from "./budget";
import { mostExpensive } from "@/lib/card-helpers";
import { ShareControl } from "./share-control";
import { Decklist } from "./decklist";
import { useDeckEditor } from "./use-deck-editor";
import type { ResolvedDeck } from "./types";

interface Props {
  deckId: string;
  initialDeck: ResolvedDeck;
  newSetCount: number;
}

type Tab = "search" | "keyword" | "import" | "export" | "suggestions" | "synergies" | "combos" | "salt" | "simulate" | "upgrades" | "newcards" | "lands" | "playtest";

// "Upgrades" looks for cheaper / pricier replacements for the cards you have; "New cards" checks recently released sets.
const TAB_LABELS: Partial<Record<Tab, string>> = { newcards: "New cards" };

export function DeckBuilder({ deckId, initialDeck, newSetCount }: Props) {
  const router = useRouter();
  // Edits show up (and the stats update) the moment you click; the server is told in the background.
  const { deck, stats, addCard, removeCard, setQuantity, moveCard, setMark, swapCard, setPublic, refresh } = useDeckEditor(deckId, initialDeck);
  const { validation, analysis, powerLevel, priceTotal, annoyance } = stats;
  const [tab, setTab] = useState<Tab>("search");
  const [searchFocus, setSearchFocus] = useState(0);
  const [name, setName] = useState(deck.name);
  const [description, setDescription] = useState(deck.description ?? "");
  const [deleting, setDeleting] = useState(false);
  const [filling, setFilling] = useState(false);

  // Press "/" anywhere (outside a text box) to jump to card search and start typing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      e.preventDefault();
      setTab("search");
      setSearchFocus((n) => n + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleImport(text: string, mode: "merge" | "replace") {
    const res = await fetch(`/api/decks/${deckId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, mode }),
    });
    const data = await res.json();
    await refresh();
    if (!res.ok) return { error: data.error ?? "Import failed" };
    return { added: data.added, unresolved: data.unresolved };
  }

  async function saveName() {
    if (!name.trim() || name === deck.name) return;
    await fetch(`/api/decks/${deckId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await refresh();
  }

  async function saveDescription() {
    if (description === (deck.description ?? "")) return;
    await fetch(`/api/decks/${deckId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: description || null }),
    });
    await refresh();
  }

  async function autofillLands() {
    setFilling(true);
    try {
      await fetch(`/api/decks/${deckId}/autofill-lands`, { method: "POST" });
      await refresh();
    } finally {
      setFilling(false);
    }
  }

  async function deleteDeck() {
    setDeleting(true);
    const res = await fetch(`/api/decks/${deckId}`, { method: "DELETE" });
    if (res.ok) router.push("/decks");
    else setDeleting(false);
  }

  const expensive = mostExpensive([...deck.commanders, ...deck.mainboard]);
  const BUDGET_TABS: Tab[] = ["search", "keyword", "suggestions", "synergies", "salt", "simulate", "newcards", "lands"];

  return (
    <BudgetProvider>
    <CollectionProvider>
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-2 flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          className="w-full max-w-md bg-transparent text-2xl font-semibold outline-none focus:border-b focus:border-black/20 dark:focus:border-white/20"
        />
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ShareControl deckId={deckId} isPublic={deck.public} onToggle={setPublic} />
          <button
            onClick={() => {
              if (confirm(`Delete "${deck.name}"? This can't be undone.`)) deleteDeck();
            }}
            disabled={deleting}
            className="rounded-md border border-black/15 px-3 py-1.5 text-xs text-black/60 hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/10"
          >
            {deleting ? "Deleting…" : "Delete deck"}
          </button>
        </div>
      </div>

      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={saveDescription}
        placeholder="Add a note about this deck's plan…"
        className="mb-6 w-full max-w-md bg-transparent text-sm text-black/50 outline-none focus:border-b focus:border-black/20 dark:text-white/50 dark:focus:border-white/20"
      />

      <div className="mb-6">
        <ValidationBanner issues={validation.issues} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
        <div data-preview-anchor className="order-2 flex flex-col gap-6 lg:order-1">
          <section>
            <h2 className="mb-2 text-sm font-semibold">Commander</h2>
            <CommanderPanel
              deckId={deckId}
              commanders={deck.commanders}
              onAdd={(card) => addCard(card, "commander")}
              onRemove={(scryfallId) => removeCard(scryfallId, "commander")}
            />
          </section>

          <section>
            <div className="mb-2 flex flex-wrap gap-1 border-b border-black/10 dark:border-white/10">
              {(["search", "keyword", "import", "export", "suggestions", "synergies", "combos", "salt", "simulate", "upgrades", "newcards", "lands", "playtest"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-2 py-1.5 text-xs font-medium capitalize ${tab === t ? "border-b-2 border-black text-black dark:border-white dark:text-white" : "text-black/40 dark:text-white/40"}`}
                >
                  {TAB_LABELS[t] ?? t}
                  {t === "newcards" && newSetCount > 0 && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#2a78d6] align-middle" title={`${newSetCount} new set${newSetCount === 1 ? "" : "s"} to check`} />}
                </button>
              ))}
            </div>
            {BUDGET_TABS.includes(tab) && <BudgetControl />}
            {tab === "search" && <CardSearch deckId={deckId} mode="card" focusSignal={searchFocus} onAdd={(card, zone) => addCard(card, zone)} />}
            {tab === "keyword" && <KeywordSearch deckId={deckId} onAdd={(card, zone) => addCard(card, zone)} />}
            {tab === "import" && <ImportPanel onImport={handleImport} />}
            {tab === "export" && <ExportPanel deck={deck} />}
            {tab === "suggestions" && (
              <SuggestionsPanel deckId={deckId} hasCommander={deck.commanders.length > 0} onAdd={(card) => addCard(card, "mainboard")} />
            )}
            {tab === "synergies" && (
              <SynergiesPanel deckId={deckId} hasCommander={deck.commanders.length > 0} onAdd={(card, zone) => addCard(card, zone)} />
            )}
            {tab === "combos" && (
              <CombosPanel deckId={deckId} hasCommander={deck.commanders.length > 0} onAdd={(scryfallId) => addCard(scryfallId, "mainboard")} />
            )}
            {tab === "salt" && <SaltPanel deckId={deckId} report={annoyance} onAdd={(card, zone) => addCard(card, zone)} />}
            {tab === "upgrades" && (
              <ReplacementsPanel deckId={deckId} hasCommander={deck.commanders.length > 0} onSwap={(incoming, outgoing) => swapCard(incoming, outgoing)} />
            )}
            {tab === "newcards" && (
              <NewCardsPanel
                deckId={deckId}
                hasCommander={deck.commanders.length > 0}
                onAdd={(card, zone) => addCard(card, zone)}
                onSwap={(incoming, outgoing) => swapCard(incoming, outgoing)}
              />
            )}
            {tab === "lands" && <LandsPanel deckId={deckId} hasCommander={deck.commanders.length > 0} onChanged={refresh} />}
            {tab === "playtest" && <PlaytestPanel commanders={deck.commanders} mainboard={deck.mainboard} />}
            {tab === "simulate" && (
              <SimulatePanel deckId={deckId} hasCommander={deck.commanders.length > 0} onAdd={(card, zone) => addCard(card, zone)} />
            )}
          </section>

          <section>
            <StatsPanel colorIdentity={validation.colorIdentity} analysis={analysis} powerLevel={powerLevel} priceTotal={priceTotal} expensive={expensive} />
            <ToBuySummary deck={deck} />
          </section>
        </div>

        <div className="order-1 flex flex-col gap-8 lg:order-2">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Mainboard ({deck.mainboard.reduce((sum, e) => sum + e.quantity, 0)})
              </h2>
              <button
                onClick={autofillLands}
                disabled={filling || deck.commanders.length === 0}
                className="rounded-md border border-black/15 px-2 py-1 text-[11px] font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
              >
                {filling ? "Filling…" : "Fill remaining with basics"}
              </button>
            </div>
            <Decklist
              entries={deck.mainboard}
              onQuantityChange={(id, qty) => setQuantity(id, "mainboard", qty)}
              onRemove={(id) => removeCard(id, "mainboard")}
              onMove={(id, newZone) => moveCard(id, "mainboard", newZone)}
              onMark={(id, mark) => setMark(id, "mainboard", mark)}
              moveTargets={[{ zone: "maybeboard", label: "Move to Maybeboard" }]}
            />
          </section>

          {(deck.maybeboard.length > 0 || tab === "import") && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">
                Maybeboard ({deck.maybeboard.reduce((sum, e) => sum + e.quantity, 0)})
              </h2>
              <Decklist
                entries={deck.maybeboard}
                onQuantityChange={(id, qty) => setQuantity(id, "maybeboard", qty)}
                onRemove={(id) => removeCard(id, "maybeboard")}
                onMove={(id, newZone) => moveCard(id, "maybeboard", newZone)}
                onMark={(id, mark) => setMark(id, "maybeboard", mark)}
                moveTargets={[{ zone: "mainboard", label: "Move to Mainboard" }]}
              />
            </section>
          )}

          {deck.unresolved.length > 0 && (
            <section className="rounded-md border border-[#fab219]/40 bg-[#fab219]/10 p-3 text-xs text-[#8a5a00] dark:text-[#fab219]">
              {deck.unresolved.length} card{deck.unresolved.length === 1 ? "" : "s"} couldn&apos;t be resolved from Scryfall: {deck.unresolved.map((u) => u.name).join(", ")}
            </section>
          )}
        </div>
      </div>
    </div>
    </CollectionProvider>
    </BudgetProvider>
  );
}
