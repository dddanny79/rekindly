import { useQuery } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FEED_BIRTHDAYS,
  type CalendarFeed,
  type CreateCalendarFeedResponse,
  type FeedBirthdays,
} from '@app/shared';
import { FormField, FormMessage } from '@/components/form-field';
import { EditButton, RemoveButton } from '@/components/row-actions';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calendarFeedsApi, calendarFeedsQuery, spacesQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { spaceName } from '@/lib/labels';

const KEYS = [['calendar-feeds']];

function Created({ created, onDone }: { created: CreateCalendarFeedResponse; onDone: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 rounded-sm border border-border-strong p-4" role="status">
      <p className="font-semibold">{t('calendar.created', { name: created.feed.name })}</p>
      <p className="mt-1 text-meta text-muted-foreground">{t('calendar.onlyOnce')}</p>
      <div className="mt-2 flex items-center justify-between gap-3 border-b py-2">
        <div data-copy-value className="num min-w-0 text-sm font-semibold break-all">
          {created.url}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('calendar.copy')}
          onClick={() =>
            void navigator.clipboard?.writeText(created.url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
      <h3 className="kicker mt-5">{t('calendar.iphone.title')}</h3>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-foreground-2">
        <li>{t('calendar.iphone.step1')}</li>
        <li>{t('calendar.iphone.step2')}</li>
      </ol>
      <Button className="mt-4" variant="secondary" onClick={onDone}>
        {t('sync.done')}
      </Button>
    </div>
  );
}

interface FeedSettings {
  name: string;
  spaceIds: string[] | null;
  birthdays: FeedBirthdays;
  includeDates: boolean;
}

const NEW_FEED: FeedSettings = {
  name: 'iPhone',
  spaceIds: null,
  birthdays: 'none',
  includeDates: false,
};

/** Name, spaces, birthdays and other days of a subscription (new or changed). */
function FeedForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: FeedSettings;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (settings: FeedSettings) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const { data: spaces = [] } = useQuery(spacesQuery);
  const [name, setName] = useState(initial.name);
  const [allSpaces, setAllSpaces] = useState(!initial.spaceIds);
  const [chosen, setChosen] = useState<string[]>(initial.spaceIds ?? []);
  const [birthdays, setBirthdays] = useState(initial.birthdays);
  const [days, setDays] = useState(initial.includeDates);
  const valid = !!name.trim() && (allSpaces || !!chosen.length);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    onSubmit({
      name: name.trim(),
      spaceIds: allSpaces ? null : chosen,
      birthdays,
      includeDates: days,
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
      <FormField label={t('calendar.name')}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </FormField>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t('calendar.spaces')}</legend>
        <label className="flex items-center gap-2 py-1 text-sm">
          <input type="radio" checked={allSpaces} onChange={() => setAllSpaces(true)} />
          {t('sync.allSpaces')}
        </label>
        <label className="flex items-center gap-2 py-1 text-sm">
          <input type="radio" checked={!allSpaces} onChange={() => setAllSpaces(false)} />
          {t('sync.someSpaces')}
        </label>
        {!allSpaces && (
          <div className="ml-6 flex flex-col">
            {spaces.map((s) => (
              <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.includes(s.id)}
                  onChange={(e) =>
                    setChosen((list) =>
                      e.target.checked ? [...list, s.id] : list.filter((id) => id !== s.id),
                    )
                  }
                />
                {spaceName(t, s)}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t('calendar.birthdays.title')}</legend>
        {FEED_BIRTHDAYS.map((option) => (
          <label key={option} className="flex items-center gap-2 py-1 text-sm">
            <input
              type="radio"
              name="birthdays"
              checked={birthdays === option}
              onChange={() => setBirthdays(option)}
            />
            {t(`calendar.birthdays.${option}`)}
          </label>
        ))}
        <p className="mt-1 text-meta text-muted-foreground">{t('calendar.birthdays.hint')}</p>
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={days}
          onChange={(e) => setDays(e.target.checked)}
        />
        <span>
          {t('calendar.includeDates')}
          <span className="block text-meta text-muted-foreground">
            {t('calendar.includeDatesHint')}
          </span>
        </span>
      </label>
      <FormMessage tone="error">{!!error && errorMessage(t, error)}</FormMessage>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" disabled={pending || !valid}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

function EditFeed({ feed, onDone }: { feed: CalendarFeed; onDone: () => void }) {
  const { t } = useTranslation();
  const update = useWrite(calendarFeedsApi.update, { invalidate: KEYS, onSuccess: onDone });
  return (
    <li className="border-b py-3" aria-label={t('calendar.editNamed', { name: feed.name })}>
      <p className="font-semibold">{t('calendar.editTitle', { name: feed.name })}</p>
      <FeedForm
        initial={feed}
        submitLabel={t('common.save')}
        pending={update.isPending}
        error={update.isError && update.error}
        onSubmit={(settings) => update.mutate({ id: feed.id, ...settings })}
        onCancel={onDone}
      />
    </li>
  );
}

/** Settings › Sync: read-only calendar subscriptions with follow-ups (and birthdays, other days). */
export function CalendarFeedsSection() {
  const { t, i18n } = useTranslation();
  const { data: feeds = [] } = useQuery(calendarFeedsQuery);
  const { data: spaces = [] } = useQuery(spacesQuery);
  const [editing, setEditing] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateCalendarFeedResponse | null>(null);
  const create = useWrite(calendarFeedsApi.create, { invalidate: KEYS, onSuccess: setCreated });
  const remove = useWrite(calendarFeedsApi.remove, { invalidate: KEYS });
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  const spacesOf = (ids: string[] | null) =>
    ids
      ? ids
          .map((id) => spaces.find((s) => s.id === id))
          .filter((s) => !!s)
          .map((s) => spaceName(t, s))
          .join(', ')
      : t('spaces.all');

  return (
    <SettingsSection title={t('calendar.title')} lead={t('calendar.lead')}>
      <ul>
        {feeds.map((f) =>
          editing === f.id ? (
            <EditFeed key={f.id} feed={f} onDone={() => setEditing(null)} />
          ) : (
            <li key={f.id} className="flex items-center gap-3 border-b py-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{f.name}</div>
                <div className="num text-meta text-muted-foreground">
                  {spacesOf(f.spaceIds)}
                  {f.birthdays !== 'none' && ` · ${t(`calendar.with.${f.birthdays}`)}`}
                  {f.includeDates && ` · ${t('calendar.withDates')}`} ·{' '}
                  {f.lastUsedAt
                    ? t('calendar.lastFetched', { date: date.format(new Date(f.lastUsedAt)) })
                    : t('sync.neverUsed')}
                </div>
              </div>
              <EditButton
                label={t('calendar.editNamed', { name: f.name })}
                onClick={() => setEditing(f.id)}
              />
              <RemoveButton
                label={t('sync.revokeNamed', { name: f.name })}
                title={t('calendar.revokeTitle', { name: f.name })}
                description={t('calendar.revokeBody')}
                onConfirm={() => remove.mutate(f.id)}
              />
            </li>
          ),
        )}
      </ul>
      {created ? (
        <Created created={created} onDone={() => setCreated(null)} />
      ) : editing ? null : (
        <FeedForm
          key={feeds.length}
          initial={NEW_FEED}
          submitLabel={t('calendar.create')}
          pending={create.isPending}
          error={create.isError && create.error}
          onSubmit={(settings) => create.mutate(settings)}
        />
      )}
    </SettingsSection>
  );
}
