import { useSyncExternalStore } from 'react';
import type { PeopleListInclude } from '@app/shared';

/**
 * Columns of the people list. The name always comes first and is not one of them.
 * Custom fields are `field:<definition id>`.
 */
export const BUILT_IN_COLUMNS = [
  'role',
  'tags',
  'lastContact',
  'updated',
  'summary',
  'nickname',
  'pronouns',
  'birthday',
  'email',
  'phone',
  'city',
  'met',
  'space',
  'contactRhythm',
  'createdAt',
] as const;
export type BuiltInColumn = (typeof BUILT_IN_COLUMNS)[number];
export type PeopleColumn = BuiltInColumn | `field:${string}`;

/** What the list showed before columns could be chosen. */
export const DEFAULT_COLUMNS: PeopleColumn[] = ['role', 'tags', 'lastContact'];

const FIELD_PREFIX = 'field:';
export const fieldColumn = (definitionId: string): PeopleColumn => `${FIELD_PREFIX}${definitionId}`;
export const columnFieldId = (column: PeopleColumn) =>
  column.startsWith(FIELD_PREFIX) ? column.slice(FIELD_PREFIX.length) : null;

const isColumn = (value: unknown): value is PeopleColumn =>
  typeof value === 'string' &&
  ((BUILT_IN_COLUMNS as readonly string[]).includes(value) ||
    (value.startsWith(FIELD_PREFIX) && value.length > FIELD_PREFIX.length));

/** Extra values the server sends only on request (`include=`). */
const INCLUDES: Partial<Record<BuiltInColumn, PeopleListInclude>> = {
  nickname: 'nickname',
  pronouns: 'pronouns',
  birthday: 'birthday',
  email: 'email',
  phone: 'phone',
  city: 'city',
  met: 'met',
  contactRhythm: 'contactRhythm',
  createdAt: 'createdAt',
};

/** `include=` value for the chosen columns, or undefined if none needs one. */
export function columnIncludes(columns: readonly PeopleColumn[]): string | undefined {
  const include = new Set<PeopleListInclude>();
  for (const column of columns) {
    if (columnFieldId(column)) include.add('fields');
    else if (INCLUDES[column as BuiltInColumn]) include.add(INCLUDES[column as BuiltInColumn]!);
  }
  return include.size ? [...include].sort().join(',') : undefined;
}

// Stored per device, like the selected space and the theme. ---------------------------

export const COLUMNS_STORAGE_KEY = 'people-columns';
const listeners = new Set<() => void>();
let current: PeopleColumn[] | null = null;

function read(): PeopleColumn[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY) ?? 'null');
    if (Array.isArray(value)) return [...new Set(value.filter(isColumn))];
  } catch {
    // Unreadable: fall back to the default.
  }
  return DEFAULT_COLUMNS;
}

/** Saves the chosen columns in their order; `null` resets to the default. */
export function setPeopleColumns(columns: PeopleColumn[] | null) {
  try {
    if (columns) localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns));
    else localStorage.removeItem(COLUMNS_STORAGE_KEY);
  } catch {
    // Not persisted (private mode); the choice lasts for this page.
  }
  current = columns ?? DEFAULT_COLUMNS;
  listeners.forEach((notify) => notify());
}

export function usePeopleColumns(): PeopleColumn[] {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => (current ??= read()),
  );
}

/** For tests: forget the cached value so the next read comes from storage. */
export function resetPeopleColumnsCache() {
  current = null;
}
