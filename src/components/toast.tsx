"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export interface ToastOptions {
  message: string;
  // An optional button on the toast, e.g. "Undo". Clicking it runs onAction and closes the toast.
  actionLabel?: string;
  onAction?: () => void;
  tone?: "info" | "error";
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (toast: ToastOptions) => void;
}

const MAX_VISIBLE = 3;
const ToastContext = createContext<ToastApi | null>(null);

// Safe to call anywhere: without a provider it just does nothing.
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}
const NOOP: ToastApi = { show: () => {} };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback((toast: ToastOptions) => {
    const id = nextId.current++;
    setItems((all) => [...all, { ...toast, id }].slice(-MAX_VISIBLE));
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const duration = toast.durationMs ?? (toast.tone === "error" ? 8000 : 6000);

  // The timer restarts each time the pointer leaves, so a toast can't vanish under your cursor.
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [paused, duration, onDismiss]);

  return (
    <div
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm shadow-lg ${
        toast.tone === "error" ? "bg-[#b3261e] text-white" : "bg-black text-white dark:bg-white dark:text-black"
      }`}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.actionLabel && (
        <button
          onClick={() => {
            toast.onAction?.();
            onDismiss();
          }}
          className="shrink-0 rounded px-1.5 py-0.5 font-semibold underline underline-offset-2 hover:bg-white/15 dark:hover:bg-black/10"
        >
          {toast.actionLabel}
        </button>
      )}
      <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 rounded px-1 opacity-60 hover:opacity-100">
        ×
      </button>
    </div>
  );
}
