import { useCallback, useSyncExternalStore } from "react";

const KEY = "fpl-entry";
const EVT = "fpl:entry:update";

function read(): number | "" {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isInteger(n) && n > 0 ? n : "";
  } catch {
    return ""; // storage blocked (some private-browsing modes)
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener(EVT, onChange);
  window.addEventListener("storage", onStorage); // other tabs
  return () => {
    window.removeEventListener(EVT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The entry ID, shared by every caller: Settings (TopNav) and the dashboard
 * each used to keep their own copy, so a change in Settings didn't reach the
 * dashboard until a reload. Only positive whole numbers are ever stored. */
export function useEntryId() {
  const entry = useSyncExternalStore(subscribe, read);
  const setEntry = useCallback((v: number | "") => {
    try {
      if (v === "") localStorage.removeItem(KEY);
      else if (Number.isInteger(v) && v > 0) localStorage.setItem(KEY, String(v));
      else return;
    } catch {
      return;
    }
    window.dispatchEvent(new Event(EVT));
  }, []);
  return { entry, setEntry };
}
