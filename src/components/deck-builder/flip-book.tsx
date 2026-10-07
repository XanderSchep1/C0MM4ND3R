"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  renderPage: (page: number) => ReactNode;
  // Text for the footer between the arrows, e.g. "Cards 7–12 of 40".
  caption?: string;
  label: string;
}

// A page of paper you turn: the old page swings away about the spine to show the next one (or
// the previous page swings back down over the current one). Arrow buttons, the ← → keys while
// the book has focus, and a swipe on touch screens all turn it. With reduced motion on, pages
// simply change.
export function FlipBook({ page, pageCount, onPageChange, renderPage, caption, label }: Props) {
  const [turn, setTurn] = useState<{ from: number; to: number } | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // If the animation event never arrives (e.g. a hidden tab), don't leave the leaf stuck on top.
  useEffect(() => {
    if (!turn) return;
    const timer = setTimeout(() => setTurn(null), 800);
    return () => clearTimeout(timer);
  }, [turn]);

  function goTo(target: number) {
    const to = Math.min(pageCount - 1, Math.max(0, target));
    if (to === page || turn) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onPageChange(to);
      return;
    }
    setTurn({ from: page, to });
    onPageChange(to);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      goTo(page + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      goTo(page - 1);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || e.pointerType === "mouse") return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > 60 && Math.abs(e.clientY - start.y) < 50) goTo(page + (dx < 0 ? 1 : -1));
  }

  // While a page is turning, the page underneath is the one being revealed (forward) or the one
  // being covered (backward); the leaf on top is the one that moves.
  const forward = turn ? turn.to > turn.from : true;
  const base = turn ? (forward ? turn.to : turn.from) : page;
  const leaf = turn ? (forward ? turn.from : turn.to) : null;

  return (
    <div
      role="group"
      aria-roledescription="book"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => (swipeStart.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={onPointerUp}
      className="flex flex-col gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#2a78d6]"
    >
      <div className={`relative overflow-hidden rounded-lg ${turn ? "pointer-events-none" : ""}`}>
        <Sheet>{renderPage(base)}</Sheet>
        {leaf !== null && (
          <div
            aria-hidden="true"
            inert
            onAnimationEnd={() => setTurn(null)}
            className={`book-leaf absolute inset-0 ${forward ? "book-leaf-away" : "book-leaf-land"}`}
          >
            <Sheet>{renderPage(leaf)}</Sheet>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={() => goTo(page - 1)}
          disabled={page <= 0 || Boolean(turn)}
          className="rounded-md border border-black/25 px-2.5 py-1.5 font-semibold hover:bg-black/5 disabled:opacity-35 dark:border-white/30 dark:hover:bg-white/10"
        >
          ‹ Previous
        </button>
        <div role="status" aria-live="polite" className="text-center text-black/60 dark:text-white/60">
          <div className="font-semibold">
            Page {page + 1} of {pageCount}
          </div>
          {caption && <div className="text-[11px]">{caption}</div>}
        </div>
        <button
          type="button"
          onClick={() => goTo(page + 1)}
          disabled={page >= pageCount - 1 || Boolean(turn)}
          className="rounded-md border border-black/25 px-2.5 py-1.5 font-semibold hover:bg-black/5 disabled:opacity-35 dark:border-white/30 dark:hover:bg-white/10"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

// One sheet of "paper" with a shaded spine down the left edge.
function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[26rem] rounded-lg border border-black/15 bg-[#fbf8f1] p-2 pl-4 dark:border-white/15 dark:bg-neutral-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-3 rounded-l-lg bg-gradient-to-r from-black/20 to-transparent dark:from-black/60" />
      {children}
    </div>
  );
}
