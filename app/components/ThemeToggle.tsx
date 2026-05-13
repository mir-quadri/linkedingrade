"use client";

import { useEffect, useState } from "react";

const KEY = "lig-theme";

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") {
        document.documentElement.dataset.theme = saved;
      }
    } catch {
      // storage blocked (privacy mode / iframe sandbox) — fall back to system pref
    }
    setMounted(true);
  }, []);

  function toggle() {
    const root = document.documentElement;
    const current = root.dataset.theme;
    const systemDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = current === "dark" || (!current && systemDark);
    const next = isDark ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // ignore quota / privacy-mode errors
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      suppressHydrationWarning
      className="font-mono"
      style={{
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--text-3)",
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-sm)",
        background: "transparent",
        visibility: mounted ? "visible" : "hidden",
      }}
    >
      ⌥ THEME
    </button>
  );
}
