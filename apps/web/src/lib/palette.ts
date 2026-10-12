import { useEffect, useState, useSyncExternalStore } from 'react';

/** Open state of the command palette, shared by the shell, sidebar and shortcuts. */
let open = false;
const listeners = new Set<() => void>();

export function setPaletteOpen(next: boolean) {
  open = next;
  listeners.forEach((notify) => notify());
}

export function usePaletteOpen() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => open,
  );
}

/** ⌘K / Ctrl+K toggles the palette everywhere, also inside fields. */
export function usePaletteShortcut() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(!open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/** `value`, updated only after it stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
