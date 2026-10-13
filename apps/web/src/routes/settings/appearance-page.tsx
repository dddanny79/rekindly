import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Copy, Download, Pencil, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type BuiltInThemeId,
  LAYOUT_FROM_THEME,
  type LayoutTemplateId,
  resolveLayout,
  themeSchema,
  type Theme,
  type ThemeRecord,
} from '@app/shared';
import { LayoutDiagram } from '@/components/appearance/layout-diagram';
import { ThemeSwatch } from '@/components/appearance/theme-swatch';
import { FormMessage } from '@/components/form-field';
import { RemoveButton } from '@/components/row-actions';
import { SettingsSection } from '@/components/settings-section';
import { ThemeControl } from '@/components/theme-control';
import { Button } from '@/components/ui/button';
import {
  downloadTheme,
  setDeviceAppearance,
  useActiveAppearance,
  useDeviceAppearance,
} from '@/lib/appearance';
import { themesApi, themesQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { TFunction } from 'i18next';

function themeName(t: TFunction, record: Pick<ThemeRecord, 'id' | 'builtIn' | 'theme'>) {
  return record.builtIn
    ? t(`appearance.themes.${record.id as BuiltInThemeId}.name`)
    : record.theme.name;
}
function themeDescription(t: TFunction, record: ThemeRecord) {
  return record.builtIn
    ? t(`appearance.themes.${record.id as BuiltInThemeId}.description`)
    : record.theme.description;
}
const layoutName = (t: TFunction, id: string) =>
  t(`appearance.layouts.${id as LayoutTemplateId | typeof LAYOUT_FROM_THEME}.name`);

/** A selectable card: native radio (arrow keys work), focus ring on the card. */
function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  preview,
  title,
  badges,
  description,
  actions,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  preview: ReactNode;
  title: ReactNode;
  badges?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-sm border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
        checked
          ? 'border-foreground shadow-[inset_0_0_0_1px_var(--foreground)]'
          : 'hover:border-foreground-2',
      )}
    >
      <label className="flex cursor-pointer flex-col gap-2">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={() => onChange(value)}
          className="sr-only"
        />
        {preview}
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-serif text-lg leading-tight">{title}</span>
          {badges}
        </span>
        {description && <span className="text-meta text-muted-foreground">{description}</span>}
      </label>
      {actions && <div className="mt-2 flex flex-wrap gap-1">{actions}</div>}
    </div>
  );
}

const Badge = ({ children }: { children: ReactNode }) => (
  <span className="kicker text-[0.625rem] text-muted-foreground">{children}</span>
);

/** Settings › Appearance: light/dark, theme and person-page layout of this device. */
export function AppearanceSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useQuery(themesQuery);
  const device = useDeviceAppearance();
  const active = useActiveAppearance();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [deleted, setDeleted] = useState<{ id: string; name: string } | null>(null);

  const create = useWrite(themesApi.create, { invalidate: [['themes']] });
  const remove = useWrite(themesApi.remove, { invalidate: [['themes']] });
  const restore = useWrite(themesApi.restore, { invalidate: [['themes']] });
  const setDefaults = useWrite(themesApi.setDefaults, { invalidate: [['themes']] });

  if (!data) return <p className="mt-6 text-muted-foreground">{t('common.loading')}</p>;
  const themes = data.themes;
  const defaultTheme = themes.find((th) => th.id === data.defaultThemeId);
  const isDefault =
    active.themeId === data.defaultThemeId && active.layoutId === data.defaultLayoutId;

  async function duplicate(record: ThemeRecord) {
    setMessage(null);
    try {
      const copy: Theme = {
        ...record.theme,
        name: t('appearance.copyName', { name: themeName(t, record) }),
      };
      delete copy.author;
      const created = await create.mutateAsync(copy);
      setDeviceAppearance({ themeId: created.id });
      await navigate({
        to: '/settings/appearance/themes/$themeId',
        params: { themeId: created.id },
      });
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(t, error) });
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage(null);
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setMessage({ tone: 'error', text: t('appearance.import.notJson') });
      return;
    }
    const parsed = themeSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setMessage({
        tone: 'error',
        text: t('appearance.import.invalid', {
          detail: issue ? `${issue.path.join('.') || 'theme'}: ${issue.message}` : '',
        }),
      });
      return;
    }
    try {
      const created = await create.mutateAsync(parsed.data);
      setDeviceAppearance({ themeId: created.id });
      setMessage({
        tone: 'success',
        text: [
          t('appearance.import.done', { name: created.theme.name }),
          created.theme.css ? t('appearance.import.hasCss') : '',
        ]
          .filter(Boolean)
          .join(' '),
      });
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(t, error) });
    }
  }

  async function removeTheme(record: ThemeRecord) {
    await remove.mutateAsync(record.id);
    setDeleted({ id: record.id, name: record.theme.name });
  }

  return (
    <>
      <SettingsSection title={t('theme.label')} lead={t('theme.hint')}>
        <ThemeControl className="max-w-md" />
      </SettingsSection>

      <SettingsSection title={t('appearance.theme.title')} lead={t('appearance.theme.lead')}>
        <div
          role="radiogroup"
          aria-label={t('appearance.theme.title')}
          className="grid gap-3 sm:grid-cols-2"
        >
          {themes.map((record) => (
            <ChoiceCard
              key={record.id}
              name="theme"
              value={record.id}
              checked={active.themeId === record.id}
              onChange={(themeId) => setDeviceAppearance({ themeId })}
              preview={<ThemeSwatch theme={record.theme} />}
              title={themeName(t, record)}
              badges={
                <>
                  {record.id === data.defaultThemeId ? (
                    <Badge>{t('appearance.badge.default')}</Badge>
                  ) : null}
                  {record.builtIn ? null : <Badge>{t('appearance.badge.own')}</Badge>}
                </>
              }
              description={themeDescription(t, record)}
              actions={
                <>
                  {!record.builtIn && (
                    <Button asChild size="xs" variant="ghost">
                      <Link
                        to="/settings/appearance/themes/$themeId"
                        params={{ themeId: record.id }}
                      >
                        <Pencil aria-hidden />
                        {t('common.edit')}
                      </Link>
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => void duplicate(record)}
                    aria-label={t('appearance.duplicateNamed', { name: themeName(t, record) })}
                  >
                    <Copy aria-hidden />
                    {t('appearance.duplicate')}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => downloadTheme(record.theme)}
                    aria-label={t('appearance.exportNamed', { name: themeName(t, record) })}
                  >
                    <Download aria-hidden />
                    {t('appearance.export')}
                  </Button>
                  {!record.builtIn && (
                    <RemoveButton
                      label={t('appearance.deleteNamed', { name: record.theme.name })}
                      title={t('appearance.deleteTitle', { name: record.theme.name })}
                      description={t('appearance.deleteHint')}
                      onConfirm={() => void removeTheme(record)}
                    />
                  )}
                </>
              }
            />
          ))}
        </div>

        {deleted && (
          <p role="status" className="mt-3 flex flex-wrap items-center gap-2 text-meta">
            {t('appearance.deleted', { name: deleted.name })}
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                void restore.mutateAsync(deleted.id).then(() => setDeleted(null));
              }}
            >
              {t('appearance.undo')}
            </Button>
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              const record = themes.find((th) => th.id === active.themeId);
              if (record) void duplicate(record);
            }}
          >
            {t('appearance.newTheme')}
          </Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden />
            {t('appearance.import.button')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label={t('appearance.import.button')}
            data-testid="theme-import"
            onChange={(event) => void importFile(event)}
          />
        </div>
        <p className="mt-2 text-meta text-muted-foreground">{t('appearance.import.hint')}</p>
        <div className="mt-2">
          {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        </div>
      </SettingsSection>

      <SettingsSection title={t('appearance.layout.title')} lead={t('appearance.layout.lead')}>
        <div
          role="radiogroup"
          aria-label={t('appearance.layout.title')}
          className="grid gap-3 sm:grid-cols-2"
        >
          {[...data.layouts.map((l) => l.id), LAYOUT_FROM_THEME].map((id) => (
            <ChoiceCard
              key={id}
              name="layout"
              value={id}
              checked={active.layoutId === id}
              onChange={(layoutId) => setDeviceAppearance({ layoutId })}
              preview={<LayoutDiagram layout={resolveLayout(id, active.theme.personPage)} />}
              title={layoutName(t, id)}
              badges={
                id === data.defaultLayoutId ? <Badge>{t('appearance.badge.default')}</Badge> : null
              }
              description={t(`appearance.layouts.${id as LayoutTemplateId}.description`)}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('appearance.defaults.title')} lead={t('appearance.defaults.lead')}>
        <p className="text-sm">
          {t('appearance.defaults.current', {
            theme: defaultTheme ? themeName(t, defaultTheme) : data.defaultThemeId,
            layout: layoutName(t, data.defaultLayoutId),
          })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={isDefault || setDefaults.isPending}
            onClick={() =>
              setDefaults.mutate({
                defaultThemeId: active.themeId,
                defaultLayoutId: active.layoutId,
              })
            }
          >
            {t('appearance.defaults.useMine')}
          </Button>
          {(device.themeId || device.layoutId) && (
            <Button
              variant="ghost"
              onClick={() => setDeviceAppearance({ themeId: undefined, layoutId: undefined })}
            >
              {t('appearance.defaults.follow')}
            </Button>
          )}
        </div>
      </SettingsSection>
    </>
  );
}
