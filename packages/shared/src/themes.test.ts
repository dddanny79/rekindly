import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_THEME_IDS,
  BUILT_IN_THEMES,
  DEFAULT_COLORS,
  LAYOUT_TEMPLATES,
  PERSON_SECTIONS,
  resolveLayout,
  themeSchema,
  themeToCss,
  themeVariables,
  type Theme,
} from './index';

const luminance = (hex: string) => {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? [...v].map((c) => c + c).join('') : v.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

const minimal = { format: 'rekindly-theme', version: 1, name: 'Mine' } as const;

describe('theme format', () => {
  it('accepts a minimal theme and every built-in theme', () => {
    expect(themeSchema.parse(minimal)).toEqual(minimal);
    for (const t of Object.values(BUILT_IN_THEMES))
      expect(themeSchema.safeParse(t).success).toBe(true);
  });

  it('rejects unknown tokens, bad colours, other formats and versions', () => {
    const bad: unknown[] = [
      { ...minimal, colors: { light: { backgroud: '#fff' } } },
      { ...minimal, colors: { light: { background: 'red' } } },
      { ...minimal, format: 'other' },
      { ...minimal, version: 2 },
      { ...minimal, fonts: { ui: 'comic-sans' } },
      { ...minimal, extra: true },
    ];
    for (const value of bad) expect(themeSchema.safeParse(value).success).toBe(false);
  });

  it('allows custom CSS but nothing that loads from elsewhere', () => {
    const css = (value: string) => themeSchema.safeParse({ ...minimal, css: value }).success;
    expect(css('.kicker { letter-spacing: 0.2em; }')).toBe(true);
    expect(css("body { background: url('data:image/png;base64,AAAA') }")).toBe(true);
    expect(css('@import url(https://example.com/x.css);')).toBe(false);
    expect(css('body { background: url(https://example.com/track.png) }')).toBe(false);
    expect(css("a { background: url( '//example.com/x' ) }")).toBe(false);
    expect(css('</style><script>alert(1)</script>')).toBe(false);
  });

  it('rejects a layout that lists a section twice', () => {
    const layout = { columns: 1, sections: [{ id: 'briefing' }, { id: 'briefing' }] };
    expect(themeSchema.safeParse({ ...minimal, personPage: layout }).success).toBe(false);
  });
});

describe('built-in themes', () => {
  const text = ['foreground', 'foreground-2', 'muted-foreground', 'signal', 'destructive'] as const;
  const spaces = [
    'space-olive',
    'space-navy',
    'space-plum',
    'space-teal',
    'space-ochre',
    'space-slate',
  ] as const;
  const controls = ['input', 'border-strong', 'ring'] as const;

  for (const id of BUILT_IN_THEME_IDS) {
    const t = BUILT_IN_THEMES[id];
    for (const mode of ['light', 'dark'] as const) {
      it(`${id} (${mode}) is readable`, () => {
        const set = { ...DEFAULT_COLORS[mode], ...t.colors?.[mode] };
        for (const token of [...text, ...spaces])
          expect(contrast(set[token], set.background), token).toBeGreaterThanOrEqual(4.5);
        for (const token of controls)
          expect(contrast(set[token], set.background), token).toBeGreaterThanOrEqual(3);
        expect(
          contrast(set.foreground, set.popover),
          'foreground on popover',
        ).toBeGreaterThanOrEqual(4.5);
        expect(contrast(set.foreground, set.muted), 'foreground on muted').toBeGreaterThanOrEqual(
          4.5,
        );
      });
    }
  }

  it('offers five alternatives to the default and five layout templates', () => {
    expect(Object.keys(BUILT_IN_THEMES)).toHaveLength(6);
    expect(LAYOUT_TEMPLATES).toHaveLength(5);
  });
});

describe('themeToCss', () => {
  it('writes every token for light and dark, falling back to the defaults', () => {
    const css = themeToCss({ ...minimal, colors: { light: { signal: '#123456' } } } as Theme);
    expect(css).toContain('--signal: #123456;');
    expect(css).toContain(`--background: ${DEFAULT_COLORS.light.background};`);
    expect(css).toContain("html:root[data-theme='dark'] {");
    expect(css).toContain(`--signal: ${DEFAULT_COLORS.dark.signal};`);
    expect(css).toContain('--spacing: 0.25rem;');
  });

  it('maps fonts, radius, density and text size and appends custom CSS', () => {
    const css = themeToCss(BUILT_IN_THEMES.clear!);
    expect(css).toContain("'Atkinson Hyperlegible Next Variable'");
    expect(css).toContain('--text-scale: 112.5%;');
    expect(themeToCss({ ...minimal, css: '.x{}' } as Theme).endsWith('.x{}')).toBe(true);
  });
});

describe('themeVariables', () => {
  it('gives the variables of one mode, for previews', () => {
    const vars = themeVariables(BUILT_IN_THEMES.hearth!, 'dark');
    expect(vars['--background']).toBe(BUILT_IN_THEMES.hearth!.colors!.dark!.background);
    expect(vars['--font-content']).toContain('Fraunces');
    expect(vars['--radius-base-sm']).toBe('10px');
  });
});

describe('resolveLayout', () => {
  it('keeps every section exactly once', () => {
    for (const { id } of LAYOUT_TEMPLATES) {
      const layout = resolveLayout(id);
      expect(layout.sections.map((s) => s.id).sort()).toEqual([...PERSON_SECTIONS].sort());
    }
  });

  it('uses the theme layout for "theme" and appends sections it leaves out', () => {
    const layout = resolveLayout('theme', {
      columns: 2,
      sections: [
        { id: 'timeline', column: 'main' },
        { id: 'tags', column: 'side', hidden: true },
      ],
    });
    expect(layout.sections.slice(0, 2)).toEqual([
      { id: 'timeline', column: 'main', hidden: false },
      { id: 'tags', column: 'side', hidden: true },
    ]);
    expect(layout.sections.find((s) => s.id === 'contact')).toEqual({
      id: 'contact',
      column: 'side',
      hidden: false,
    });
  });

  it('falls back to the classic layout', () => {
    expect(resolveLayout('nope')).toEqual(resolveLayout('classic'));
    expect(resolveLayout('theme')).toEqual(resolveLayout('classic'));
    expect(resolveLayout('conversation').sections.every((s) => s.column === 'main')).toBe(true);
  });
});
