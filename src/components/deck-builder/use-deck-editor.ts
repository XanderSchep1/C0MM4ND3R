"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import type { DeckRole } from "@/lib/deck-access";
import type { CardMark } from "@/lib/card-mark";
import { addToDeck, findEntry, moveBetween, removeFrom, setMarkIn, setQuantityIn, swapPrinting, type EditZone } from "@/lib/deck-edits";
import { computeDeckStats } from "@/lib/deck-stats";
import { DeckSync } from "@/lib/deck-sync";
import { MAX_DECK_ROWS } from "@/lib/limits";
import { printingLabel } from "@/lib/printings";
import type { ResolvedDeck, ScryfallCard } from "./types";

const ZONE_LABEL: Record<EditZone, string> = { commander: "Commander", mainboard: "Mainboard", maybeboard: "Maybeboard" };

// Owns the deck on the page. Every edit changes the screen (and the stats) at once, then
// quietly tells the server; see DeckSync for how the two are kept in step. Removing or moving
// a card offers Undo.
// A friend invited to the deck (a "contributor") can only suggest cards, which go to the Maybeboard tagged with
// their name. The server enforces that too; this just makes the screen match.
export interface DeckViewer {
  role: DeckRole;
  id: string;
  name: string;
}

export function useDeckEditor(deckId: string, initialDeck: ResolvedDeck, viewer: DeckViewer) {
  const { show } = useToast();
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  }, [show]);

  const [deck, setDeck] = useState(initialDeck);
  const deckRef = useRef(initialDeck); // always the latest deck, even between renders

  // addCard's Undo needs removeCard / setQuantity, which are defined after it (they use addCard too).
  const removeCardRef = useRef<(scryfallId: string, zone: EditZone, options?: { undo?: boolean }) => void>(() => {});
  const undoQuantityRef = useRef<(scryfallId: string, zone: EditZone, quantity: number) => void>(() => {});

  // Created after mount (and again if React remounts in development), so nothing here runs during render.
  const syncRef = useRef<DeckSync<ResolvedDeck> | null>(null);
  useEffect(() => {
    const sync = new DeckSync<ResolvedDeck>({
      fetchDeck: async () => {
        const res = await fetch(`/api/decks/${deckId}`);
        return res.ok ? ((await res.json()).deck as ResolvedDeck) : null;
      },
      applyServerDeck: (next) => {
        deckRef.current = next;
        setDeck(next);
      },
      onError: (message) => showRef.current({ message, tone: "error" }),
    });
    syncRef.current = sync;

    // A friend may have suggested cards while this tab sat in the background: look again when you come back to it.
    const lookAgain = () => {
      if (document.visibilityState === "visible") sync.reconcileSoon(true);
    };
    window.addEventListener("focus", lookAgain);
    document.addEventListener("visibilitychange", lookAgain);

    return () => {
      window.removeEventListener("focus", lookAgain);
      document.removeEventListener("visibilitychange", lookAgain);
      sync.dispose();
      if (syncRef.current === sync) syncRef.current = null;
    };
  }, [deckId]);

  const stats = useMemo(() => computeDeckStats(deck), [deck]);

  const cardsUrl = `/api/decks/${deckId}/cards`;
  const json = useCallback(
    (method: string, url: string, body?: unknown) => () =>
      fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }),
    []
  );
  const send = useCallback((request: () => Promise<Response>, fallbackMessage: string) => syncRef.current?.send(request, fallbackMessage), []);

  // Applies an edit to the local deck. Returns false if the edit isn't allowed.
  const apply = useCallback((edit: (d: ResolvedDeck) => ResolvedDeck | null): boolean => {
    const next = edit(deckRef.current);
    if (!next) return false;
    deckRef.current = next;
    syncRef.current?.touch();
    setDeck(next);
    return true;
  }, []);

  const setMark = useCallback(
    (scryfallId: string, zone: EditZone, mark: CardMark | null) => {
      if (!findEntry(deckRef.current, scryfallId, zone)) return;
      apply((d) => setMarkIn(d, scryfallId, zone, mark));
      send(json("PATCH", cardsUrl, { scryfallId, zone, mark }), "Couldn't save that highlight.");
    },
    [apply, send, json, cardsUrl]
  );

  // Pass the full card for an instant update; a bare id (all some panels have) waits for the server.
  // `announce` shows an "Added … · Undo" toast, so an add is visible wherever the page is scrolled.
  const addCard = useCallback(
    async (card: ScryfallCard | string, requestedZone: EditZone, requestedQuantity = 1, options: { announce?: boolean } = {}) => {
      const suggesting = viewer.role === "contributor";
      const zone: EditZone = suggesting ? "maybeboard" : requestedZone;
      const quantity = suggesting ? 1 : requestedQuantity;
      if (typeof card === "string") {
        send(json("POST", cardsUrl, { scryfallId: card, zone, quantity }), "Couldn't add that card.");
        await syncRef.current?.refresh();
        return;
      }
      const hadBefore = findEntry(deckRef.current, card.id, zone)?.quantity ?? 0;
      if (suggesting) {
        // A suggestion is for a card the deck doesn't have yet, in any printing or part of the deck.
        const d = deckRef.current;
        const has = [...d.commanders, ...d.mainboard, ...d.maybeboard].some((e) => e.card.name === card.name);
        if (has) {
          showRef.current({ message: `${card.name} is already in this deck.`, tone: "error", durationMs: 4000 });
          return;
        }
      }
      if (!apply((d) => addToDeck(d, card, zone, quantity, suggesting ? { id: viewer.id, name: viewer.name } : undefined))) {
        showRef.current({ message: `A deck can hold at most ${MAX_DECK_ROWS} different cards.`, tone: "error" });
        return;
      }
      send(json("POST", cardsUrl, { scryfallId: card.id, zone, quantity }), `Couldn't add ${card.name}.`);
      if (options.announce) {
        showRef.current({
          key: "added",
          message: suggesting ? `Suggested ${card.name} for the Maybeboard` : `Added ${card.name} to the ${ZONE_LABEL[zone]}`,
          actionLabel: "Undo",
          durationMs: 4000,
          // Back to how many copies there were before (none, if it was new).
          onAction: () => (hadBefore > 0 ? undoQuantityRef.current(card.id, zone, hadBefore) : removeCardRef.current(card.id, zone, { undo: false })),
        });
      }
    },
    [apply, send, json, cardsUrl, viewer.role, viewer.id, viewer.name]
  );

  const restoreCard = useCallback(
    (entry: { card: ScryfallCard; quantity: number; mark?: CardMark | null }, zone: EditZone) => {
      void addCard(entry.card, zone, entry.quantity);
      if (entry.mark) setMark(entry.card.id, zone, entry.mark);
    },
    [addCard, setMark]
  );

  const removeCard = useCallback(
    (scryfallId: string, zone: EditZone, options: { undo?: boolean } = {}) => {
      const entry = findEntry(deckRef.current, scryfallId, zone);
      if (!entry) return;
      apply((d) => removeFrom(d, scryfallId, zone));
      send(() => fetch(`${cardsUrl}?scryfallId=${encodeURIComponent(scryfallId)}&zone=${zone}`, { method: "DELETE" }), `Couldn't remove ${entry.card.name}.`);
      if (options.undo !== false) {
        showRef.current({ message: `Removed ${entry.card.name}`, actionLabel: "Undo", onAction: () => restoreCard(entry, zone) });
      }
    },
    [apply, send, cardsUrl, restoreCard]
  );

  const setQuantity = useCallback(
    (scryfallId: string, zone: EditZone, quantity: number) => {
      const entry = findEntry(deckRef.current, scryfallId, zone);
      if (!entry) return;
      if (!(quantity > 0)) return removeCard(scryfallId, zone);
      apply((d) => setQuantityIn(d, scryfallId, zone, quantity));
      send(json("PATCH", cardsUrl, { scryfallId, zone, quantity }), `Couldn't change ${entry.card.name}.`);
    },
    [apply, send, json, cardsUrl, removeCard]
  );

  useEffect(() => {
    removeCardRef.current = removeCard;
    undoQuantityRef.current = setQuantity;
  }, [removeCard, setQuantity]);

  // Moves a whole line between zones. Returns what moved, or null if there was nothing to move.
  const performMove = useCallback(
    (scryfallId: string, from: EditZone, to: EditZone) => {
      const entry = findEntry(deckRef.current, scryfallId, from);
      if (!entry || from === to) return null;
      const merged = Boolean(findEntry(deckRef.current, scryfallId, to));
      apply((d) => moveBetween(d, scryfallId, from, to));
      send(json("PATCH", cardsUrl, { scryfallId, zone: from, newZone: to }), `Couldn't move ${entry.card.name}.`);
      return { entry, merged };
    },
    [apply, send, json, cardsUrl]
  );

  const moveCard = useCallback(
    (scryfallId: string, from: EditZone, to: EditZone) => {
      const moved = performMove(scryfallId, from, to);
      // Undoing a move that merged into an existing line couldn't split it back apart, so no Undo then.
      if (!moved || moved.merged) return;
      showRef.current({
        message: `Moved ${moved.entry.card.name} to ${ZONE_LABEL[to]}`,
        actionLabel: "Undo",
        onAction: () => performMove(scryfallId, to, from),
      });
    },
    [performMove]
  );

  // Switches a line to another printing (different art) of the same card.
  const performPrintingChange = useCallback(
    (scryfallId: string, zone: EditZone, next: ScryfallCard) => {
      const entry = findEntry(deckRef.current, scryfallId, zone);
      if (!entry || entry.card.id === next.id) return null;
      const merged = Boolean(findEntry(deckRef.current, next.id, zone));
      apply((d) => swapPrinting(d, scryfallId, zone, next));
      send(json("PATCH", cardsUrl, { scryfallId, zone, printingId: next.id }), `Couldn't change the art for ${entry.card.name}.`);
      return { previous: entry.card, merged };
    },
    [apply, send, json, cardsUrl]
  );

  const changePrinting = useCallback(
    (scryfallId: string, zone: EditZone, next: ScryfallCard) => {
      const changed = performPrintingChange(scryfallId, zone, next);
      // Undoing a change that merged two lines couldn't split them apart again, so no Undo then.
      if (!changed || changed.merged) return;
      showRef.current({
        key: "art",
        message: `Changed the art of ${next.name} to ${printingLabel(next)}`,
        actionLabel: "Undo",
        onAction: () => performPrintingChange(next.id, zone, changed.previous),
      });
    },
    [performPrintingChange]
  );

  // Adds `incoming` and takes one copy of `outgoing` out (used by Upgrades).
  const swapCard = useCallback(
    async (incoming: ScryfallCard, outgoing: ScryfallCard) => {
      const outgoingEntry = findEntry(deckRef.current, outgoing.id, "mainboard");
      await addCard(incoming, "mainboard");
      if (outgoingEntry && outgoingEntry.quantity > 1) setQuantity(outgoing.id, "mainboard", outgoingEntry.quantity - 1);
      else removeCard(outgoing.id, "mainboard", { undo: false });
      showRef.current({
        message: `Swapped ${outgoing.name} for ${incoming.name}`,
        actionLabel: "Undo",
        onAction: () => {
          removeCard(incoming.id, "mainboard", { undo: false });
          void addCard(outgoing, "mainboard");
        },
      });
    },
    [addCard, setQuantity, removeCard]
  );

  const setPublic = useCallback(
    (next: boolean) => {
      apply((d) => ({ ...d, public: next }));
      send(json("PATCH", `/api/decks/${deckId}`, { public: next }), "Couldn't change sharing.");
    },
    [apply, send, json, deckId]
  );

  // Waits for queued edits, then reloads the deck from the server (after imports, land fills, …).
  const refresh = useCallback(async () => {
    await syncRef.current?.refresh();
  }, []);

  return { deck, stats, addCard, removeCard, setQuantity, moveCard, setMark, changePrinting, swapCard, setPublic, refresh };
}
