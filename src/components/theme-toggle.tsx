"use client";

import { useEffect, useState } from "react";

type ThemePref = "system" | "light" | "dark";
const STORAGE_KEY = "theme";

function applyTheme(pref: ThemePref) {
  const isDark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    // Deferred a tick so this reads as "syncing from an external system"
    // rather than a synchronous render-phase update — the toggle's active
    // state lags the real (already-applied-before-paint) theme by a frame
    // at most, which is invisible.
    queueMicrotask(() => {
      const stored = (localStorage.getItem(STORAGE_KEY) as ThemePref | null) ?? "system";
      setPref(stored);
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) as ThemePref | null ?? "system") === "system") applyTheme("system");
    };
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  function choose(next: ThemePref) {
    setPref(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  const options: { value: ThemePref; label: string }[] = [
    { value: "system", label: "Auto" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];

  return (
    <div className="flex rounded-md border border-black/15 p-0.5 text-xs dark:border-white/15">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => choose(o.value)}
          aria-pressed={pref === o.value}
          className={`rounded px-2 py-1 font-medium transition ${
            pref === o.value ? "bg-black text-white dark:bg-white dark:text-black" : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
