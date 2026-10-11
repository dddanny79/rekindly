import { useCallback, useState } from 'react';

/** useState that survives navigation within the tab (sessionStorage). */
export function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Not persisted; fine.
      }
    },
    [key],
  );
  return [value, update] as const;
}
