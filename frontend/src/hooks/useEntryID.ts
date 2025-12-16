import { useEffect, useState } from "react";

export function useEntryId() {
  const [entry, setEntry] = useState<number | "">(() => {
    const stored = localStorage.getItem("fpl-entry");
    return stored ? Number(stored) : "";
  });
  useEffect(() => { if (entry !== "") localStorage.setItem("fpl-entry", String(entry)); }, [entry]);
  return { entry, setEntry };
}