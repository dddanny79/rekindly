import { useSyncExternalStore } from 'react';

/**
 * Light/dark preference. "system" follows prefers-color-scheme. The resolved theme
 * is written to <html data-theme>, which the CSS tokens key off. index.html applies
 * the stored preference before first paint with an inline copy of resolveTheme.
 */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  return darkQuery().matches ? 'dark' : 'light';
}

export function applyTheme(preference = getThemePreference()) {
  document.documentElement.dataset.theme = resolveTheme(preference);
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
  current = preference;
  applyTheme(preference);
  listeners.forEach((notify) => notify());
}

let current: ThemePreference | null = null;

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => (current ??= getThemePreference()));
}

/** Applies the stored preference and follows system changes while on "system". */
export function initTheme() {
  applyTheme();
  darkQuery().addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme('system');
  });
}
