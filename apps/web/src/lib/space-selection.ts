import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { spacesQuery } from '@/lib/data';

/** Selected space: a space id or "all". Remembered per device. */
const STORAGE_KEY = 'space';
export const ALL_SPACES = 'all';

const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ALL_SPACES;
  } catch {
    return ALL_SPACES;
  }
}

export function setSelectedSpace(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Not persisted (private mode); the selection lasts for this page.
  }
  current = value;
  listeners.forEach((notify) => notify());
}

let current: string | null = null;

/**
 * The selected space, validated against the live spaces (a deleted space falls back
 * to "all"). `spaceId` is undefined for "all" and can be passed to list queries.
 */
export function useSelectedSpace() {
  const selected = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => (current ??= read()),
  );
  const { data: spaces = [] } = useQuery(spacesQuery);
  const space = spaces.find((s) => s.id === selected) ?? null;
  return {
    selected: space ? space.id : ALL_SPACES,
    spaceId: space?.id,
    space,
    spaces,
    /** Space for new records: the selected one, else the first. */
    defaultSpaceId: space?.id ?? spaces[0]?.id,
  };
}
