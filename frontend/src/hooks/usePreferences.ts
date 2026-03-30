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

  // save, apply theme, tell other instances on this tab
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    applyTheme(prefs.theme);
    window.dispatchEvent(new CustomEvent(EVT, { detail: prefs }));
  }, [prefs]);

  // follow system dark/light if theme is "system"
  useEffect(() => {
    const mm = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (prefs.theme === "system") applyTheme("system"); };
    mm.addEventListener("change", onChange);
    return () => mm.removeEventListener("change", onChange);
  }, [prefs.theme]);

  // pick up changes fired by other usePreferences instances on this tab
  useEffect(() => {
    const onPrefs = (e: Event) => {
      const next = (e as CustomEvent<Preferences>).detail;
      setPrefs((current) => {
        if (JSON.stringify(next) !== JSON.stringify(current)) return next;
        return current;
      });
    };
    window.addEventListener(EVT, onPrefs);
    return () => window.removeEventListener(EVT, onPrefs);
  }, []);

  // pick up changes from other tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          const parsed = { ...DEFAULTS, ...JSON.parse(e.newValue) } as Preferences;
          setPrefs((current) => {
            if (JSON.stringify(parsed) !== JSON.stringify(current)) return parsed;
            return current;
          });
        } catch { }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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