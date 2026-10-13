import { useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import {
  BUILT_IN_THEMES,
  DEFAULT_LAYOUT_ID,
  DEFAULT_THEME_ID,
  resolveLayout,
  themeToCss,
  type Theme,
} from '@app/shared';
import { themesQuery } from '@/lib/data';

/**
 * Theme and person-page layout. Each device picks its own (stored in localStorage);
 * without a choice it follows the instance defaults. The CSS of the active theme is
 * cached so that index.html can apply it before the first paint.
 */
export const APPEARANCE_STORAGE_KEY = 'appearance';
export const APPEARANCE_CSS_KEY = 'appearance-css';
const STYLE_ID = 'app-theme';

export interface DeviceAppearance {
  themeId?: string;
  layoutId?: string;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function readChoice(): DeviceAppearance {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}');
    if (!value || typeof value !== 'object') return {};
    const { themeId, layoutId } = value as Record<string, unknown>;
    return {
      ...(typeof themeId === 'string' ? { themeId } : {}),
      ...(typeof layoutId === 'string' ? { layoutId } : {}),
    };
  } catch {
    return {};
  }
}

let choice: DeviceAppearance | null = null;

export function setDeviceAppearance(patch: DeviceAppearance) {
  const next = { ...readChoice(), ...patch };
  for (const key of ['themeId', 'layoutId'] as const) if (!next[key]) delete next[key];
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  choice = next;
  notify();
}

export function useDeviceAppearance(): DeviceAppearance {
  return useSyncExternalStore(subscribe, () => (choice ??= readChoice()));
}

// Preview: the theme editor shows its draft across the app while it is open.
let preview: Theme | null = null;
export function setThemePreview(theme: Theme | null) {
  preview = theme;
  notify();
}
const usePreview = () => useSyncExternalStore(subscribe, () => preview);

export function applyThemeCss(css: string) {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

/** The theme and layout in effect on this device. */
export function useActiveAppearance() {
  const { data } = useQuery(themesQuery);
  const device = useDeviceAppearance();
  const previewTheme = usePreview();
  const defaultThemeId = data?.defaultThemeId ?? DEFAULT_THEME_ID;
  const themes = data?.themes ?? [];
  const wantedId = device.themeId ?? defaultThemeId;
  const record =
    themes.find((t) => t.id === wantedId) ?? themes.find((t) => t.id === defaultThemeId);
  const themeId = record?.id ?? (wantedId in BUILT_IN_THEMES ? wantedId : DEFAULT_THEME_ID);
  const theme = previewTheme ?? record?.theme ?? BUILT_IN_THEMES[themeId]!;
  const layoutId = device.layoutId ?? data?.defaultLayoutId ?? DEFAULT_LAYOUT_ID;
  return {
    loaded: !!data,
    themeId,
    theme,
    layoutId,
    layout: resolveLayout(layoutId, theme.personPage),
    previewing: !!previewTheme,
  };
}

/** Applies the active theme (mounted once in the app shell). */
export function useApplyAppearance() {
  const { loaded, theme, previewing } = useActiveAppearance();
  useEffect(() => {
    // Until the list is loaded, the cached CSS from index.html stays in place.
    if (!loaded && !previewing) return;
    const css = themeToCss(theme);
    applyThemeCss(css);
    if (previewing) return;
    try {
      localStorage.setItem(APPEARANCE_CSS_KEY, css);
    } catch {
      // Without storage the theme still applies, just a moment later on reload.
    }
  }, [loaded, theme, previewing]);
}

/** Matches a media query and follows changes (e.g. the two-column breakpoint). */
export function useMediaQuery(query: string) {
  const supported = typeof window.matchMedia === 'function';
  return useSyncExternalStore(
    (notifyChange) => {
      if (!supported) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notifyChange);
      return () => list.removeEventListener('change', notifyChange);
    },
    () => supported && window.matchMedia(query).matches,
  );
}

/** Downloads a theme as a `.json` file to share or import elsewhere. */
export function downloadTheme(theme: Theme) {
  const slug =
    theme.name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w]+/g, '-')
      .replace(/^-|-$/g, '') || 'theme';
  const blob = new Blob([`${JSON.stringify(theme, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.rekindly-theme.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
