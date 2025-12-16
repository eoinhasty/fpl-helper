// src/hooks/useAgeTicker.ts
import { useEffect, useRef, useState } from 'react';

/** Start at initialAge (seconds) and tick up every second; null stays null. */
export function useAgeTicker(initialAge: number | null) {
  const [age, setAge] = useState<number | null>(initialAge);
  const started = useRef(false);

  useEffect(() => {
    setAge(initialAge);
    started.current = true;
  }, [initialAge]);

  useEffect(() => {
    if (age === null) return;
    const id = setInterval(() => setAge((a) => (a == null ? null : a + 1)), 1000);
    return () => clearInterval(id);
  }, [age]);

  return age;
}