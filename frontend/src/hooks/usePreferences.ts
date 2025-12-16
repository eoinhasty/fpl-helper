import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";
export type DefaultView = "squad" | "live";
export type SquadLayout = "list" | "pitch";

export type Preferences = {
  theme: Theme;
  compactCards: boolean;
  showXBadges: boolean;
  defaultView: DefaultView;
  squadLayout: SquadLayout;
};

const KEY = "fpl-prefs-v1";

const DEFAULTS: Preferences = {
  theme: "system",
  compactCards: false,
  showXBadges: false,
  defaultView: "squad",
  squadLayout: "list",
};

const EVT = "fpl:prefs:update";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && systemDark);
  root.classList.toggle("dark", isDark);
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  // Persist + theme + broadcast to other hook instances
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    applyTheme(prefs.theme);
    // NEW: notify other hook users in the same tab
    window.dispatchEvent(new CustomEvent(EVT, { detail: prefs }));
  }, [prefs]);

  // React to system theme changes (already there)
  useEffect(() => {
    const mm = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (prefs.theme === "system") applyTheme("system"); };
    mm.addEventListener("change", onChange);
    return () => mm.removeEventListener("change", onChange);
  }, [prefs.theme]);

  // NEW: listen for updates from other components (same tab)
  useEffect(() => {
    const onPrefs = (e: Event) => {
      const next = (e as CustomEvent<Preferences>).detail;
      // Avoid loops if identical
      if (JSON.stringify(next) !== JSON.stringify(prefs)) {
        setPrefs(next);
      }
    };
    window.addEventListener(EVT, onPrefs as EventListener);
    return () => window.removeEventListener(EVT, onPrefs as EventListener);
  }, [prefs]);

  // Optional: multi-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          const parsed = { ...DEFAULTS, ...JSON.parse(e.newValue) } as Preferences;
          if (JSON.stringify(parsed) !== JSON.stringify(prefs)) setPrefs(parsed);
        } catch { }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [prefs]);

  return {
    prefs,
    setPrefs,
    set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
      setPrefs((p) => ({ ...p, [key]: value }));
    },
    reset() {
      setPrefs(DEFAULTS);
    },
  };
}