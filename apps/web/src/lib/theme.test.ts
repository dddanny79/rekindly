import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  getThemePreference,
  resolveTheme,
  setThemePreference,
  THEME_STORAGE_KEY,
} from './theme';

function stubSystemDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => vi.unstubAllGlobals());

  it('defaults to system and ignores invalid stored values', () => {
    expect(getThemePreference()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(getThemePreference()).toBe('system');
  });

  it('resolves system from prefers-color-scheme', () => {
    stubSystemDark(true);
    expect(resolveTheme('system')).toBe('dark');
    stubSystemDark(false);
    expect(resolveTheme('system')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('stores an explicit choice and applies it to <html>', () => {
    stubSystemDark(false);
    setThemePreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('removes the stored value when switching back to system', () => {
    stubSystemDark(true);
    setThemePreference('light');
    setThemePreference('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('applies the stored preference', () => {
    stubSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
