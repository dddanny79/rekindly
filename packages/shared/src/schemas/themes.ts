import { z } from 'zod';

/**
 * Themes: colours (light and dark), fonts, corner radius, density, text size, the
 * layout of the person page and optional custom CSS. The JSON format is versioned
 * and documented in docs/themes.md; files shared between instances use it as is.
 */

export const THEME_FORMAT = 'rekindly-theme';
export const THEME_VERSION = 1;

/** Colour tokens a theme can set (see docs/design.md for their use). */
export const THEME_COLOR_TOKENS = [
  'background',
  'foreground',
  'foreground-2',
  'muted',
  'muted-foreground',
  'popover',
  'border',
  'border-strong',
  'input',
  'ring',
  'signal',
  'signal-tint',
  'destructive',
  'space-olive',
  'space-navy',
  'space-plum',
  'space-teal',
  'space-ochre',
  'space-slate',
  'overlay',
] as const;
export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];

/** Bundled fonts (no CDN). `system-*` use the fonts of the device. */
export const THEME_FONTS = {
  newsreader: { label: 'Newsreader', stack: "'Newsreader Variable', Georgia, serif" },
  'source-sans-3': {
    label: 'Source Sans 3',
    stack: "'Source Sans 3 Variable', system-ui, sans-serif",
  },
  'source-serif-4': {
    label: 'Source Serif 4',
    stack: "'Source Serif 4 Variable', Georgia, serif",
  },
  literata: { label: 'Literata', stack: "'Literata Variable', Georgia, serif" },
  fraunces: { label: 'Fraunces', stack: "'Fraunces Variable', Georgia, serif" },
  inter: { label: 'Inter', stack: "'Inter Variable', system-ui, sans-serif" },
  'ibm-plex-sans': {
    label: 'IBM Plex Sans',
    stack: "'IBM Plex Sans Variable', system-ui, sans-serif",
  },
  'atkinson-hyperlegible-next': {
    label: 'Atkinson Hyperlegible Next',
    stack: "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif",
  },
  'system-sans': {
    label: 'System (sans-serif)',
    stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  'system-serif': {
    label: 'System (serif)',
    stack: "ui-serif, Georgia, 'Times New Roman', serif",
  },
} as const;
export type ThemeFont = keyof typeof THEME_FONTS;
export const THEME_FONT_KEYS = Object.keys(THEME_FONTS) as [ThemeFont, ...ThemeFont[]];

export const THEME_RADII = ['none', 'small', 'medium', 'large'] as const;
export const THEME_DENSITIES = ['compact', 'normal', 'comfortable'] as const;
export const THEME_TEXT_SIZES = ['small', 'normal', 'large'] as const;
export type ThemeRadius = (typeof THEME_RADII)[number];
export type ThemeDensity = (typeof THEME_DENSITIES)[number];
export type ThemeTextSize = (typeof THEME_TEXT_SIZES)[number];

/** Sections of the person page, in their default order. */
export const PERSON_SECTIONS = [
  'briefing',
  'contact',
  'timeline',
  'facts',
  'relationships',
  'organizations',
  'details',
  'fields',
  'addresses',
  'met',
  'tags',
] as const;
export type PersonSection = (typeof PERSON_SECTIONS)[number];

// Schemas ----------------------------------------------------------------------------

export const themeColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'Use a hex colour such as #1a2b3c');

const colorSetSchema = z.partialRecord(z.enum(THEME_COLOR_TOKENS), themeColorSchema);
export type ThemeColorSet = z.infer<typeof colorSetSchema>;

export const personPageLayoutSchema = z
  .object({
    /** 2 = main column and side column on wide screens; 1 = everything in one column. */
    columns: z.union([z.literal(1), z.literal(2)]),
    /** Width of the side column in two-column mode. */
    sideWidth: z.enum(['narrow', 'wide']).optional(),
    /** Order on one column (and on phones); in two columns each column keeps this order. */
    sections: z
      .array(
        z.strictObject({
          id: z.enum(PERSON_SECTIONS),
          column: z.enum(['main', 'side']).optional(),
          hidden: z.boolean().optional(),
        }),
      )
      .max(PERSON_SECTIONS.length),
  })
  .strict()
  .refine((layout) => new Set(layout.sections.map((s) => s.id)).size === layout.sections.length, {
    message: 'Each section may appear only once',
    path: ['sections'],
  });
export type PersonPageLayout = z.infer<typeof personPageLayoutSchema>;

/**
 * Custom CSS is applied as written, but must not load anything from elsewhere:
 * no @import and no url() other than data: URLs (the app makes no external calls).
 */
export const themeCssSchema = z
  .string()
  .max(20_000)
  .refine((css) => !/@import/i.test(css), { message: '@import is not allowed' })
  .refine(
    (css) =>
      ![...css.matchAll(/url\(\s*(['"]?)\s*([^'")\s]*)/gi)].some(
        (m) => !/^data:/i.test(m[2] ?? ''),
      ),
    {
      message: 'Only data: URLs are allowed in url()',
    },
  )
  .refine((css) => !/<\/?style|expression\s*\(|javascript:/i.test(css), {
    message: 'This CSS is not allowed',
  });

export const themeSchema = z
  .object({
    format: z.literal(THEME_FORMAT),
    version: z.literal(THEME_VERSION),
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(300).optional(),
    author: z.string().trim().max(80).optional(),
    colors: z
      .strictObject({ light: colorSetSchema.optional(), dark: colorSetSchema.optional() })
      .optional(),
    fonts: z
      .strictObject({
        content: z.enum(THEME_FONT_KEYS).optional(),
        ui: z.enum(THEME_FONT_KEYS).optional(),
      })
      .optional(),
    radius: z.enum(THEME_RADII).optional(),
    density: z.enum(THEME_DENSITIES).optional(),
    textSize: z.enum(THEME_TEXT_SIZES).optional(),
    personPage: personPageLayoutSchema.optional(),
    css: themeCssSchema.optional(),
  })
  .strict();
export type Theme = z.infer<typeof themeSchema>;

// API ------------------------------------------------------------------------------

/** A theme as the API returns it: built-in (fixed id) or created on this instance. */
export const themeRecordSchema = z.object({
  id: z.string(),
  builtIn: z.boolean(),
  theme: themeSchema,
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type ThemeRecord = z.infer<typeof themeRecordSchema>;

/** Built-in layout templates of the person page. */
export const layoutTemplateSchema = z.object({ id: z.string(), layout: personPageLayoutSchema });
export type LayoutTemplate = z.infer<typeof layoutTemplateSchema>;

/** `theme` as layout id: use the layout of the selected theme (or the default). */
export const LAYOUT_FROM_THEME = 'theme';

export const themeListResponseSchema = z.object({
  themes: z.array(themeRecordSchema),
  layouts: z.array(layoutTemplateSchema),
  /** Instance defaults, used by every device that has not chosen otherwise. */
  defaultThemeId: z.string(),
  defaultLayoutId: z.string(),
});
export type ThemeListResponse = z.infer<typeof themeListResponseSchema>;

export const saveThemeRequestSchema = z.object({ theme: themeSchema });
export type SaveThemeRequest = z.infer<typeof saveThemeRequestSchema>;

export const themeDefaultsRequestSchema = z
  .object({ defaultThemeId: z.string().min(1), defaultLayoutId: z.string().min(1) })
  .partial();
export type ThemeDefaultsRequest = z.infer<typeof themeDefaultsRequestSchema>;
