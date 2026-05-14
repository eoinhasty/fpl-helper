// src/hooks/useAgeTicker.ts
import { useEffect, useState } from 'react';

/** Start at initialAge (seconds) and tick up every second; null stays null. */
export function useAgeTicker(initialAge: number | null) {
  const [age, setAge] = useState<number | null>(initialAge);

  useEffect(() => {
    setAge(initialAge);
  }, [initialAge]);

  useEffect(() => {
    if (initialAge === null) return;
    const id = setInterval(() => setAge((a) => (a == null ? null : a + 1)), 1000);
    return () => clearInterval(id);
  }, [initialAge]);

  return age;
}