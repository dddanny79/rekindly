import {
  LAYOUT_FROM_THEME,
  PERSON_SECTIONS,
  THEME_COLOR_TOKENS,
  THEME_FONTS,
  THEME_FORMAT,
  THEME_VERSION,
  type LayoutTemplate,
  type PersonPageLayout,
  type PersonSection,
  type Theme,
  type ThemeColorSet,
} from './schemas/themes';

/**
 * Built-in themes, layout templates and the conversion of a theme into CSS custom
 * properties. Shared by the server (built-in list) and the web app (applying them).
 */

export const BUILT_IN_THEME_IDS = [
  'rekindly',
  'ledger',
  'hearth',
  'clear',
  'studio',
  'forest',
] as const;
export type BuiltInThemeId = (typeof BUILT_IN_THEME_IDS)[number];
export const LAYOUT_TEMPLATE_IDS = [
  'classic',
  'conversation',
  'profile',
  'address-book',
  'focus',
] as const;
export type LayoutTemplateId = (typeof LAYOUT_TEMPLATE_IDS)[number];

export const DEFAULT_THEME_ID: BuiltInThemeId = 'rekindly';
export const DEFAULT_LAYOUT_ID: LayoutTemplateId = 'classic';

/** The colours of the default theme; any token a theme leaves out falls back to these. */
export const DEFAULT_COLORS: { light: Required<ThemeColorSet>; dark: Required<ThemeColorSet> } = {
  light: {
    background: '#faf9f6',
    foreground: '#141414',
    'foreground-2': '#3b3a36',
    muted: '#f1eee6',
    'muted-foreground': '#5c5a54',
    popover: '#ffffff',
    border: '#d6d2c8',
    'border-strong': '#141414',
    input: '#8a867c',
    ring: '#141414',
    signal: '#b23a1c',
    'signal-tint': '#f6e1d8',
    destructive: '#a3231a',
    'space-olive': '#53632a',
    'space-navy': '#2a4869',
    'space-plum': '#6e3a62',
    'space-teal': '#1f5f5a',
    'space-ochre': '#7a5410',
    'space-slate': '#4a5058',
    overlay: '#14141466',
  },
  dark: {
    background: '#121314',
    foreground: '#eae6de',
    'foreground-2': '#c6c1b7',
    muted: '#1c1d1f',
    'muted-foreground': '#a09b90',
    popover: '#1b1c1e',
    border: '#34332f',
    'border-strong': '#8c877d',
    input: '#6e6a62',
    ring: '#eae6de',
    signal: '#f08a6c',
    'signal-tint': '#3a231c',
    destructive: '#ff8a7a',
    'space-olive': '#b9c67e',
    'space-navy': '#93b3d8',
    'space-plum': '#d6a8cb',
    'space-teal': '#86c9c1',
    'space-ochre': '#ddbb6e',
    'space-slate': '#b6bcc4',
    overlay: '#0000009e',
  },
};

const theme = (t: Omit<Theme, 'format' | 'version'>): Theme => ({
  format: THEME_FORMAT,
  version: THEME_VERSION,
  ...t,
});

/** Built-in themes by id. Names stay English in exported files; the UI translates them. */
export const BUILT_IN_THEMES: Record<BuiltInThemeId, Theme> & Record<string, Theme | undefined> = {
  rekindly: theme({
    name: 'Rekindly',
    description: 'Set like a newspaper column: serif content, quiet controls, one red pencil.',
    colors: DEFAULT_COLORS,
    fonts: { content: 'newsreader', ui: 'source-sans-3' },
    radius: 'small',
    density: 'normal',
    textSize: 'normal',
  }),
  ledger: theme({
    name: 'Ledger',
    description: 'Dense and cool for many contacts at work: one sans-serif, square corners.',
    colors: {
      light: {
        background: '#f6f7f9',
        foreground: '#111418',
        'foreground-2': '#333a44',
        muted: '#eceff3',
        'muted-foreground': '#525a66',
        popover: '#ffffff',
        border: '#d5dae1',
        'border-strong': '#111418',
        input: '#7a8390',
        ring: '#111418',
        signal: '#b3261e',
        'signal-tint': '#f7dedb',
        destructive: '#9c1c14',
        'space-olive': '#465f22',
        'space-navy': '#1f4f8a',
        'space-plum': '#6b3d74',
        'space-teal': '#13615a',
        'space-ochre': '#6f4c0f',
        'space-slate': '#46505c',
        overlay: '#11141866',
      },
      dark: {
        background: '#0f1216',
        foreground: '#e6e9ee',
        'foreground-2': '#c3c9d2',
        muted: '#191d23',
        'muted-foreground': '#9aa3af',
        popover: '#171b21',
        border: '#2b313a',
        'border-strong': '#7f8996',
        input: '#66707c',
        ring: '#e6e9ee',
        signal: '#ff8a80',
        'signal-tint': '#3b1f1d',
        destructive: '#ff8f84',
        'space-olive': '#b3cf86',
        'space-navy': '#8db7ee',
        'space-plum': '#d3a9dc',
        'space-teal': '#7fd0c6',
        'space-ochre': '#e2bf72',
        'space-slate': '#b5bfcb',
        overlay: '#000000a0',
      },
    },
    fonts: { content: 'ibm-plex-sans', ui: 'ibm-plex-sans' },
    radius: 'none',
    density: 'compact',
    textSize: 'normal',
  }),
  hearth: theme({
    name: 'Hearth',
    description: 'Warm paper and terracotta, generous spacing and soft corners.',
    colors: {
      light: {
        background: '#fbf6ef',
        foreground: '#2a1d15',
        'foreground-2': '#4a3a2e',
        muted: '#f3e9dc',
        'muted-foreground': '#6b5748',
        popover: '#fffdf9',
        border: '#e3d4c2',
        'border-strong': '#2a1d15',
        input: '#94806d',
        ring: '#2a1d15',
        signal: '#a8411a',
        'signal-tint': '#f8dfcf',
        destructive: '#a12a1c',
        'space-olive': '#53621f',
        'space-navy': '#2f4c6e',
        'space-plum': '#7a3b5c',
        'space-teal': '#215e57',
        'space-ochre': '#7b500b',
        'space-slate': '#57524d',
        overlay: '#2a1d1566',
      },
      dark: {
        background: '#1a1410',
        foreground: '#f1e6d8',
        'foreground-2': '#d6c6b2',
        muted: '#241c16',
        'muted-foreground': '#ad9a86',
        popover: '#221a14',
        border: '#3b2f26',
        'border-strong': '#95826e',
        input: '#7a6858',
        ring: '#f1e6d8',
        signal: '#f4935f',
        'signal-tint': '#3e2416',
        destructive: '#ff9479',
        'space-olive': '#c2cf86',
        'space-navy': '#9dbbe0',
        'space-plum': '#e0aecb',
        'space-teal': '#8dd0c4',
        'space-ochre': '#e6c27a',
        'space-slate': '#c4bdb5',
        overlay: '#000000a0',
      },
    },
    fonts: { content: 'fraunces', ui: 'source-sans-3' },
    radius: 'large',
    density: 'comfortable',
    textSize: 'normal',
  }),
  clear: theme({
    name: 'Clear',
    description: 'Highest contrast and a typeface made for legibility, with larger text.',
    colors: {
      light: {
        background: '#ffffff',
        foreground: '#000000',
        'foreground-2': '#1f1f1f',
        muted: '#f0f0f0',
        'muted-foreground': '#3d3d3d',
        popover: '#ffffff',
        border: '#8a8a8a',
        'border-strong': '#000000',
        input: '#4d4d4d',
        ring: '#000000',
        signal: '#a8140a',
        'signal-tint': '#ffd9d4',
        destructive: '#8f0d06',
        'space-olive': '#3d4f12',
        'space-navy': '#0f3566',
        'space-plum': '#5c1f50',
        'space-teal': '#0b4a44',
        'space-ochre': '#5e3d00',
        'space-slate': '#33393f',
        overlay: '#00000080',
      },
      dark: {
        background: '#000000',
        foreground: '#ffffff',
        'foreground-2': '#e6e6e6',
        muted: '#1a1a1a',
        'muted-foreground': '#c7c7c7',
        popover: '#121212',
        border: '#6b6b6b',
        'border-strong': '#d9d9d9',
        input: '#a6a6a6',
        ring: '#ffffff',
        signal: '#ff9e8a',
        'signal-tint': '#4a1a12',
        destructive: '#ffa094',
        'space-olive': '#cfe08f',
        'space-navy': '#a9cbff',
        'space-plum': '#f0b8e3',
        'space-teal': '#8fe3d8',
        'space-ochre': '#ffd47a',
        'space-slate': '#d0d6dd',
        overlay: '#000000b3',
      },
    },
    fonts: { content: 'atkinson-hyperlegible-next', ui: 'atkinson-hyperlegible-next' },
    radius: 'small',
    density: 'comfortable',
    textSize: 'large',
  }),
  studio: theme({
    name: 'Studio',
    description: 'Modern and calm: Inter throughout, indigo accents, rounded corners.',
    colors: {
      light: {
        background: '#fafafb',
        foreground: '#18181b',
        'foreground-2': '#3f3f46',
        muted: '#f1f1f4',
        'muted-foreground': '#5b5b66',
        popover: '#ffffff',
        border: '#e0e0e6',
        'border-strong': '#18181b',
        input: '#85858f',
        ring: '#4338ca',
        signal: '#b23a0a',
        'signal-tint': '#fde5d6',
        destructive: '#b91c1c',
        'space-olive': '#3f6212',
        'space-navy': '#3730a3',
        'space-plum': '#86198f',
        'space-teal': '#115e59',
        'space-ochre': '#854d0e',
        'space-slate': '#475569',
        overlay: '#18181b66',
      },
      dark: {
        background: '#111114',
        foreground: '#ececf1',
        'foreground-2': '#c8c8d0',
        muted: '#1b1b20',
        'muted-foreground': '#a1a1ad',
        popover: '#18181d',
        border: '#2e2e36',
        'border-strong': '#85858f',
        input: '#6b6b76',
        ring: '#a5b4fc',
        signal: '#fb923c',
        'signal-tint': '#3d2213',
        destructive: '#f87171',
        'space-olive': '#bef264',
        'space-navy': '#a5b4fc',
        'space-plum': '#f0abfc',
        'space-teal': '#5eead4',
        'space-ochre': '#fcd34d',
        'space-slate': '#cbd5e1',
        overlay: '#000000a0',
      },
    },
    fonts: { content: 'inter', ui: 'inter' },
    radius: 'medium',
    density: 'normal',
    textSize: 'normal',
  }),
  forest: theme({
    name: 'Forest',
    description: 'Quiet greens and a bookish serif, for long reading on the timeline.',
    colors: {
      light: {
        background: '#f5f7f2',
        foreground: '#16201a',
        'foreground-2': '#34413a',
        muted: '#e8eee4',
        'muted-foreground': '#526156',
        popover: '#fcfdfb',
        border: '#cfd9cc',
        'border-strong': '#16201a',
        input: '#7a8a7f',
        ring: '#16201a',
        signal: '#a33b1d',
        'signal-tint': '#f4dccf',
        destructive: '#9b2418',
        'space-olive': '#425a1a',
        'space-navy': '#24496b',
        'space-plum': '#6a3a5e',
        'space-teal': '#1a5d53',
        'space-ochre': '#6d4e10',
        'space-slate': '#46524b',
        overlay: '#16201a66',
      },
      dark: {
        background: '#0f1511',
        foreground: '#e3ebe2',
        'foreground-2': '#c1cdc0',
        muted: '#172019',
        'muted-foreground': '#9aab9c',
        popover: '#151d17',
        border: '#2a352d',
        'border-strong': '#829184',
        input: '#637166',
        ring: '#e3ebe2',
        signal: '#ee9070',
        'signal-tint': '#3a2219',
        destructive: '#ff917f',
        'space-olive': '#b9d27f',
        'space-navy': '#96bde0',
        'space-plum': '#d8aacb',
        'space-teal': '#86cfc3',
        'space-ochre': '#dcc077',
        'space-slate': '#b8c4bb',
        overlay: '#000000a0',
      },
    },
    fonts: { content: 'literata', ui: 'source-sans-3' },
    radius: 'small',
    density: 'normal',
    textSize: 'normal',
  }),
};

const sections = (
  list: [PersonSection, 'main' | 'side', boolean?][],
): PersonPageLayout['sections'] =>
  list.map(([id, column, hidden]) => ({ id, column, ...(hidden ? { hidden } : {}) }));

/** Layout templates of the person page. */
export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    // The original page: briefing and timeline in the main column, the rest beside it.
    id: 'classic',
    layout: {
      columns: 2,
      sideWidth: 'narrow',
      sections: sections([
        ['briefing', 'main'],
        ['contact', 'side'],
        ['timeline', 'main'],
        ['facts', 'side'],
        ['relationships', 'side'],
        ['organizations', 'side'],
        ['details', 'side'],
        ['fields', 'side'],
        ['addresses', 'side'],
        ['met', 'side'],
        ['tags', 'side'],
      ]),
    },
  },
  {
    // One column that reads top to bottom: what matters for the next conversation first.
    id: 'conversation',
    layout: {
      columns: 1,
      sections: sections([
        ['briefing', 'main'],
        ['facts', 'main'],
        ['timeline', 'main'],
        ['contact', 'main'],
        ['relationships', 'main'],
        ['organizations', 'main'],
        ['details', 'main'],
        ['addresses', 'main'],
        ['fields', 'main'],
        ['met', 'main'],
        ['tags', 'main'],
      ]),
    },
  },
  {
    // Who someone is at a glance: details and connections first, the timeline beside.
    id: 'profile',
    layout: {
      columns: 2,
      sideWidth: 'wide',
      sections: sections([
        ['briefing', 'main'],
        ['contact', 'side'],
        ['details', 'main'],
        ['facts', 'main'],
        ['relationships', 'main'],
        ['organizations', 'main'],
        ['timeline', 'side'],
        ['addresses', 'main'],
        ['fields', 'main'],
        ['met', 'main'],
        ['tags', 'main'],
      ]),
    },
  },
  {
    // An address card: how to reach someone first, notes and history after.
    id: 'address-book',
    layout: {
      columns: 2,
      sideWidth: 'wide',
      sections: sections([
        ['contact', 'main'],
        ['briefing', 'side'],
        ['addresses', 'main'],
        ['organizations', 'main'],
        ['facts', 'side'],
        ['relationships', 'main'],
        ['details', 'main'],
        ['tags', 'side'],
        ['fields', 'main'],
        ['met', 'side'],
        ['timeline', 'main'],
      ]),
    },
  },
  {
    // Only what a conversation needs: briefing, timeline and how to reach someone.
    id: 'focus',
    layout: {
      columns: 1,
      sections: sections([
        ['briefing', 'main'],
        ['timeline', 'main'],
        ['contact', 'main'],
        ['facts', 'main', true],
        ['relationships', 'main', true],
        ['organizations', 'main', true],
        ['details', 'main', true],
        ['fields', 'main', true],
        ['addresses', 'main', true],
        ['met', 'main', true],
        ['tags', 'main', true],
      ]),
    },
  },
];

export const layoutTemplate = (id: string) => LAYOUT_TEMPLATES.find((t) => t.id === id)?.layout;

/**
 * The layout to use: a template, or the theme's own layout for `theme`. Sections a
 * layout does not mention (e.g. added in a later version) keep their default place.
 */
export function resolveLayout(layoutId: string, themeLayout?: PersonPageLayout) {
  const chosen =
    (layoutId === LAYOUT_FROM_THEME ? themeLayout : layoutTemplate(layoutId)) ??
    layoutTemplate(DEFAULT_LAYOUT_ID)!;
  const classic = layoutTemplate(DEFAULT_LAYOUT_ID)!.sections;
  const listed = chosen.sections.map((s) => ({
    id: s.id,
    column: chosen.columns === 1 ? ('main' as const) : (s.column ?? 'main'),
    hidden: s.hidden ?? false,
  }));
  for (const id of PERSON_SECTIONS) {
    if (listed.some((s) => s.id === id)) continue;
    const fallback = classic.find((s) => s.id === id)!;
    listed.push({
      id,
      column: chosen.columns === 1 ? 'main' : (fallback.column ?? 'main'),
      hidden: false,
    });
  }
  return { columns: chosen.columns, sideWidth: chosen.sideWidth ?? 'narrow', sections: listed };
}
export type ResolvedLayout = ReturnType<typeof resolveLayout>;

// CSS ---------------------------------------------------------------------------------

const RADIUS = {
  none: { xs: '0px', sm: '0px', lg: '0px' },
  small: { xs: '2px', sm: '3px', lg: '8px' },
  medium: { xs: '4px', sm: '6px', lg: '12px' },
  large: { xs: '6px', sm: '10px', lg: '16px' },
} as const;
const SPACING = { compact: '0.22rem', normal: '0.25rem', comfortable: '0.285rem' } as const;
const TEXT_SCALE = { small: '93.75%', normal: '100%', large: '112.5%' } as const;

const declarations = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');

/**
 * CSS custom properties for a theme, light on `html:root`, dark on
 * `html:root[data-theme=dark]` (one step more specific than the stylesheet, so the
 * order of the style elements does not matter), plus the theme's own CSS.
 */
export function themeToCss(t: Theme): string {
  const light = { ...DEFAULT_COLORS.light, ...t.colors?.light };
  const dark = { ...DEFAULT_COLORS.dark, ...t.colors?.dark };
  const radius = RADIUS[t.radius ?? 'small'];
  const base = {
    '--font-content': THEME_FONTS[t.fonts?.content ?? 'newsreader'].stack,
    '--font-ui': THEME_FONTS[t.fonts?.ui ?? 'source-sans-3'].stack,
    '--radius-base-xs': radius.xs,
    '--radius-base-sm': radius.sm,
    '--radius-base-lg': radius.lg,
    '--spacing': SPACING[t.density ?? 'normal'],
    '--text-scale': TEXT_SCALE[t.textSize ?? 'normal'],
  };
  const colors = (set: Record<string, string>) =>
    Object.fromEntries(THEME_COLOR_TOKENS.map((token) => [`--${token}`, set[token]!]));
  return [
    `html:root {\n${declarations({ ...base, ...colors(light) })}\n}`,
    `html:root[data-theme='dark'] {\n${declarations(colors(dark))}\n}`,
    t.css?.trim() ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** A short list of colours to preview a theme (swatches in the picker). */
export function themeSwatches(t: Theme, mode: 'light' | 'dark') {
  const set = { ...DEFAULT_COLORS[mode], ...t.colors?.[mode] };
  return {
    background: set.background,
    foreground: set.foreground,
    muted: set.muted,
    signal: set.signal,
    spaces: [set['space-olive'], set['space-navy'], set['space-plum']],
  };
}
