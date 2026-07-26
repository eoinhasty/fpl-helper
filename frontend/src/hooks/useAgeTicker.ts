// src/hooks/useAgeTicker.ts
import { useEffect, useRef, useState } from 'react';

/** Start at initialAge (seconds) and tick up every second; null stays null. */
export function useAgeTicker(initialAge: number | null) {
  const baseRef = useRef(initialAge);
  const startRef = useRef(Date.now());
  const [, forceTick] = useState(0);

  if (baseRef.current !== initialAge) {
    baseRef.current = initialAge;
    startRef.current = Date.now();
  }

  useEffect(() => {
    if (initialAge === null) return;
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [initialAge]);

  if (initialAge === null) return null;
  return initialAge + Math.floor((Date.now() - startRef.current) / 1000);
}
