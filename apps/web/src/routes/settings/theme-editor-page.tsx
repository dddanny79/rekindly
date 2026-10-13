import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, ChevronLeft, Download } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_COLORS,
  LAYOUT_TEMPLATES,
  layoutTemplate,
  resolveLayout,
  THEME_DENSITIES,
  THEME_FONT_KEYS,
  THEME_FONTS,
  THEME_RADII,
  THEME_TEXT_SIZES,
  themeSchema,
  type LayoutTemplateId,
  type PersonPageLayout,
  type Theme,
  type ThemeColorToken,
} from '@app/shared';
import { PagePreview } from '@/components/appearance/page-preview';
import { FormField, FormMessage } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { downloadTheme, setThemePreview } from '@/lib/appearance';
import { themesApi, themesQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { applyTheme } from '@/lib/theme';
import { NotFoundPage } from '@/routes/not-found-page';

const route = getRouteApi('/app/settings/appearance/themes/$themeId');

const GROUPS: { key: 'surfaces' | 'text' | 'signal' | 'spaces'; tokens: ThemeColorToken[] }[] = [
  {
    key: 'surfaces',
    tokens: ['background', 'popover', 'muted', 'border', 'border-strong', 'input', 'overlay'],
  },
  { key: 'text', tokens: ['foreground', 'foreground-2', 'muted-foreground', 'ring'] },
  { key: 'signal', tokens: ['signal', 'signal-tint', 'destructive'] },
  {
    key: 'spaces',
    tokens: ['space-olive', 'space-navy', 'space-plum', 'space-teal', 'space-ochre', 'space-slate'],
  },
];
/** Tokens used as text: their contrast against the background is shown. */
const TEXT_TOKENS = new Set<ThemeColorToken>([
  'foreground',
  'foreground-2',
  'muted-foreground',
  'signal',
  'destructive',
  'space-olive',
  'space-navy',
  'space-plum',
  'space-teal',
  'space-ochre',
  'space-slate',
]);

function luminance(hex: string) {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? [...v].map((c) => c + c).join('') : v.slice(0, 6);
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x = 0, y = 0] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const sixDigits = (hex: string) => {
  const v = hex.replace('#', '');
  return `#${v.length === 3 ? [...v].map((c) => c + c).join('') : v.slice(0, 6)}`;
};

function ColorRow({
  token,
  value,
  background,
  onChange,
}: {
  token: ThemeColorToken;
  value: string;
  background: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  // While typing, the field keeps its own text; valid values go to the theme at once.
  const [editing, setEditing] = useState<string | null>(null);
  const text = editing ?? value;
  const valid = HEX.test(text);
  const ratio = TEXT_TOKENS.has(token) && valid ? contrast(value, background) : null;
  const label = t(`appearance.tokens.${token}`);
  return (
    <div className="flex items-center gap-2 border-b py-1.5">
      <input
        type="color"
        aria-label={t('appearance.editor.pick', { name: label })}
        value={sixDigits(value)}
        onChange={(e) => onChange(e.target.value + (value.length === 9 ? value.slice(7) : ''))}
        className="size-8 shrink-0 cursor-pointer rounded-sm border bg-transparent p-0.5"
      />
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      {ratio !== null && (
        <span
          className={`num text-meta ${ratio < 4.5 ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
          title={t('appearance.editor.contrast')}
        >
          {ratio.toFixed(1)}:1
        </span>
      )}
      <Input
        aria-label={t('appearance.editor.hex', { name: label })}
        value={text}
        onChange={(e) => {
          setEditing(e.target.value);
          if (HEX.test(e.target.value.trim())) onChange(e.target.value.trim());
        }}
        onBlur={() => setEditing(null)}
        aria-invalid={!valid || undefined}
        className="num h-8 w-28 font-mono text-meta"
      />
    </div>
  );
}

function LayoutEditor({
  layout,
  onChange,
}: {
  layout: PersonPageLayout;
  onChange: (layout: PersonPageLayout) => void;
}) {
  const { t } = useTranslation();
  const resolved = resolveLayout('theme', layout);
  const sections = resolved.sections;
  const write = (next: typeof sections, patch: Partial<PersonPageLayout> = {}) =>
    onChange({
      columns: layout.columns,
      ...(layout.sideWidth ? { sideWidth: layout.sideWidth } : {}),
      ...patch,
      sections: next.map(({ id, column, hidden }) => ({
        id,
        column,
        ...(hidden ? { hidden } : {}),
      })),
    });
  const move = (index: number, step: number) => {
    const next = [...sections];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item!);
    write(next);
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t('appearance.editor.startFrom')}>
          <Select
            value=""
            onChange={(e) => {
              const template = layoutTemplate(e.target.value);
              if (template) onChange(structuredClone(template));
            }}
          >
            <option value="" disabled>
              {t('appearance.editor.chooseTemplate')}
            </option>
            {LAYOUT_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {t(`appearance.layouts.${tpl.id as LayoutTemplateId}.name`)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <Labeled label={t('appearance.editor.columns')}>
        <SegmentedControl
          label={t('appearance.editor.columns')}
          value={String(layout.columns) as '1' | '2'}
          options={[
            { value: '1', label: t('appearance.editor.oneColumn') },
            { value: '2', label: t('appearance.editor.twoColumns') },
          ]}
          onChange={(value) => write(sections, { columns: Number(value) as 1 | 2 })}
          className="max-w-sm"
        />
      </Labeled>
      {layout.columns === 2 && (
        <Labeled label={t('appearance.editor.sideWidth')}>
          <SegmentedControl
            label={t('appearance.editor.sideWidth')}
            value={layout.sideWidth ?? 'narrow'}
            options={[
              { value: 'narrow', label: t('appearance.editor.narrow') },
              { value: 'wide', label: t('appearance.editor.wide') },
            ]}
            onChange={(sideWidth) => write(sections, { sideWidth })}
            className="max-w-sm"
          />
        </Labeled>
      )}
      <ol aria-label={t('appearance.editor.sections')} className="border-t border-border-strong">
        {sections.map((section, index) => {
          const name = t(`appearance.sections.${section.id}`);
          return (
            <li key={section.id} className="flex flex-wrap items-center gap-2 border-b py-1.5">
              <span
                className={`min-w-0 flex-1 text-sm ${section.hidden ? 'text-muted-foreground line-through' : ''}`}
              >
                {name}
              </span>
              {layout.columns === 2 && (
                <Select
                  aria-label={t('appearance.editor.column', { name })}
                  value={section.column}
                  onChange={(e) =>
                    write(
                      sections.map((s) =>
                        s.id === section.id
                          ? { ...s, column: e.target.value as 'main' | 'side' }
                          : s,
                      ),
                    )
                  }
                  className="w-32"
                >
                  <option value="main">{t('appearance.editor.main')}</option>
                  <option value="side">{t('appearance.editor.side')}</option>
                </Select>
              )}
              <label className="flex items-center gap-1.5 text-meta">
                <input
                  type="checkbox"
                  checked={!section.hidden}
                  onChange={(e) =>
                    write(
                      sections.map((s) =>
                        s.id === section.id ? { ...s, hidden: !e.target.checked } : s,
                      ),
                    )
                  }
                />
                {t('appearance.editor.visible')}
              </label>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={index === 0}
                aria-label={t('appearance.editor.up', { name })}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={index === sections.length - 1}
                aria-label={t('appearance.editor.down', { name })}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A segmented control with its label shown above it. */
function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span aria-hidden className="text-sm font-semibold">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Settings › Appearance › edit an own theme, previewed live across the app. */
export function ThemeEditorPage() {
  const { themeId } = route.useParams();
  const { data } = useQuery(themesQuery);
  const record = data?.themes.find((th) => th.id === themeId && !th.builtIn);
  if (!data) return null;
  if (!record) return <NotFoundPage />;
  return <ThemeEditor key={record.id} id={record.id} initial={record.theme} />;
}

function ThemeEditor({ id, initial }: { id: string; initial: Theme }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Theme>(initial);
  const [mode, setMode] = useState<'light' | 'dark'>(
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  const [error, setError] = useState<string | null>(null);
  const save = useWrite(themesApi.update, { invalidate: [['themes']] });
  const parsed = useMemo(() => themeSchema.safeParse(draft), [draft]);

  // Preview the draft everywhere while editing; show the mode whose colours are edited.
  useEffect(() => {
    if (parsed.success) setThemePreview(parsed.data);
  }, [parsed]);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);
  useEffect(
    () => () => {
      setThemePreview(null);
      applyTheme();
    },
    [],
  );

  const colors = { ...DEFAULT_COLORS[mode], ...draft.colors?.[mode] };
  const setColor = (token: ThemeColorToken, value: string) =>
    setDraft((d) => ({
      ...d,
      colors: { ...d.colors, [mode]: { ...d.colors?.[mode], [token]: value } },
    }));
  const issues = parsed.success ? [] : parsed.error.issues;

  async function onSave() {
    if (!parsed.success) return;
    setError(null);
    try {
      await save.mutateAsync({ id, theme: parsed.data });
      await navigate({ to: '/settings/appearance' });
    } catch (e) {
      setError(errorMessage(t, e));
    }
  }

  return (
    <div className="pb-10">
      <p className="mt-5">
        <Link
          to="/settings/appearance"
          className="inline-flex items-center gap-1 text-sm no-underline hover:underline"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {t('settings.tabs.appearance')}
        </Link>
      </p>
      <h2 className="mt-2 font-serif text-h2">{t('appearance.editor.title')}</h2>
      <p className="mt-1 text-meta text-muted-foreground">{t('appearance.editor.lead')}</p>

      <div className="lg:grid lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:gap-10">
        <div className="mt-4 lg:order-2 lg:mt-9">
          <div className="lg:sticky lg:top-4">
            <PagePreview
              theme={parsed.success ? parsed.data : initial}
              layout={resolveLayout('theme', draft.personPage)}
              mode={mode}
            />
            <p className="mt-2 text-meta text-muted-foreground">
              {t('appearance.editor.previewHint')}
            </p>
          </div>
        </div>
        <div className="min-w-0">
          <SettingsSection title={t('appearance.editor.about')}>
            <div className="grid gap-3">
              <FormField label={t('appearance.editor.name')}>
                <Input
                  value={draft.name}
                  maxLength={60}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </FormField>
              <FormField label={t('appearance.editor.description')}>
                <Input
                  value={draft.description ?? ''}
                  maxLength={300}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value || undefined })}
                />
              </FormField>
              <FormField
                label={t('appearance.editor.author')}
                hint={t('appearance.editor.authorHint')}
              >
                <Input
                  value={draft.author ?? ''}
                  maxLength={80}
                  onChange={(e) => setDraft({ ...draft, author: e.target.value || undefined })}
                />
              </FormField>
            </div>
          </SettingsSection>

          <SettingsSection
            title={t('appearance.editor.colors')}
            lead={t('appearance.editor.colorsLead')}
          >
            <Labeled label={t('appearance.editor.mode')}>
              <SegmentedControl
                label={t('appearance.editor.mode')}
                value={mode}
                options={[
                  { value: 'light', label: t('theme.light') },
                  { value: 'dark', label: t('theme.dark') },
                ]}
                onChange={setMode}
                className="max-w-xs"
              />
            </Labeled>
            {GROUPS.map((group) => (
              <div key={group.key} className="mt-4">
                <h3 className="kicker text-muted-foreground">
                  {t(`appearance.groups.${group.key}`)}
                </h3>
                <div className="mt-1">
                  {group.tokens.map((token) => (
                    <ColorRow
                      key={token}
                      token={token}
                      value={colors[token]}
                      background={colors.background}
                      onChange={(value) => setColor(token, value)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </SettingsSection>

          <SettingsSection title={t('appearance.editor.type')}>
            <div className="grid gap-4">
              {(['content', 'ui'] as const).map((slot) => (
                <FormField key={slot} label={t(`appearance.editor.font.${slot}`)}>
                  <Select
                    value={
                      draft.fonts?.[slot] ?? (slot === 'content' ? 'newsreader' : 'source-sans-3')
                    }
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        fonts: {
                          ...draft.fonts,
                          [slot]: e.target.value as (typeof THEME_FONT_KEYS)[number],
                        },
                      })
                    }
                  >
                    {THEME_FONT_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {THEME_FONTS[key].label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ))}
              <Labeled label={t('appearance.editor.textSize')}>
                <SegmentedControl
                  label={t('appearance.editor.textSize')}
                  value={draft.textSize ?? 'normal'}
                  options={THEME_TEXT_SIZES.map((v) => ({
                    value: v,
                    label: t(`appearance.textSize.${v}`),
                  }))}
                  onChange={(textSize) => setDraft({ ...draft, textSize })}
                />
              </Labeled>
              <Labeled label={t('appearance.editor.density')}>
                <SegmentedControl
                  label={t('appearance.editor.density')}
                  value={draft.density ?? 'normal'}
                  options={THEME_DENSITIES.map((v) => ({
                    value: v,
                    label: t(`appearance.density.${v}`),
                  }))}
                  onChange={(density) => setDraft({ ...draft, density })}
                />
              </Labeled>
              <Labeled label={t('appearance.editor.radius')}>
                <SegmentedControl
                  label={t('appearance.editor.radius')}
                  value={draft.radius ?? 'small'}
                  options={THEME_RADII.map((v) => ({
                    value: v,
                    label: t(`appearance.radius.${v}`),
                  }))}
                  onChange={(radius) => setDraft({ ...draft, radius })}
                />
              </Labeled>
            </div>
          </SettingsSection>

          <SettingsSection
            title={t('appearance.editor.layout')}
            lead={t('appearance.editor.layoutLead')}
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!draft.personPage}
                onChange={(e) => {
                  const next = { ...draft };
                  if (e.target.checked)
                    next.personPage = structuredClone(layoutTemplate('classic')!);
                  else delete next.personPage;
                  setDraft(next);
                }}
              />
              {t('appearance.editor.ownLayout')}
            </label>
            {draft.personPage && (
              <div className="mt-4">
                <LayoutEditor
                  layout={draft.personPage}
                  onChange={(personPage) => setDraft({ ...draft, personPage })}
                />
              </div>
            )}
          </SettingsSection>

          <SettingsSection title={t('appearance.editor.css')} lead={t('appearance.editor.cssLead')}>
            <textarea
              aria-label={t('appearance.editor.css')}
              value={draft.css ?? ''}
              onChange={(e) => setDraft({ ...draft, css: e.target.value || undefined })}
              rows={6}
              spellCheck={false}
              className="w-full rounded-sm border border-input bg-popover p-2.5 font-mono text-meta"
              placeholder=".kicker { letter-spacing: 0.2em; }"
            />
          </SettingsSection>

          {issues.length > 0 && (
            <ul className="mt-6 text-sm text-destructive" role="alert">
              {issues.slice(0, 5).map((issue, i) => (
                <li key={i}>
                  {issue.path.join('.') || t('appearance.editor.theme')}: {issue.message}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => void onSave()} disabled={!parsed.success || save.isPending}>
              {t('common.save')}
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/settings/appearance">{t('common.cancel')}</Link>
            </Button>
            <Button
              variant="ghost"
              disabled={!parsed.success}
              onClick={() => parsed.success && downloadTheme(parsed.data)}
            >
              <Download aria-hidden />
              {t('appearance.export')}
            </Button>
          </div>
          <div className="mt-2">{error && <FormMessage tone="error">{error}</FormMessage>}</div>
        </div>
      </div>
    </div>
  );
}
