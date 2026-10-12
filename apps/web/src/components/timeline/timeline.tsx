import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DIRECTED_KINDS,
  ENTRY_KINDS,
  type Entry,
  type EntryDirection,
  type EntryKind,
  type PersonRef,
} from '@app/shared';
import { Combobox } from '@/components/combobox';
import { FormMessage } from '@/components/form-field';
import { Markdown } from '@/components/markdown';
import { EditButton, RemoveButton } from '@/components/row-actions';
import { directionArrow, KIND_ICONS } from '@/components/timeline/entry-kind';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { entriesApi, entriesQuery, peopleQuery, TIMELINE_KEYS, useWrite } from '@/lib/data';
import { toDateTimeLocal } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/** Filter groups from the design: all · conversations · notes · events. */
const FILTERS = {
  all: ENTRY_KINDS,
  conversations: ['call', 'meeting', 'message'],
  notes: ['note'],
  events: ['event'],
} as const satisfies Record<string, readonly EntryKind[]>;
type Filter = keyof typeof FILTERS;

function EntryEditForm({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const { t } = useTranslation();
  const { data: people = [] } = useQuery(peopleQuery({}));
  const [kind, setKind] = useState<EntryKind>(entry.kind);
  const [direction, setDirection] = useState<EntryDirection>(entry.direction ?? 'out');
  const [when, setWhen] = useState(toDateTimeLocal(new Date(entry.occurredAt)));
  const [body, setBody] = useState(entry.bodyMd);
  const [linked, setLinked] = useState<PersonRef[]>(entry.people);
  const save = useWrite((patch: Record<string, unknown>) => entriesApi.update(entry.id, patch), {
    invalidate: TIMELINE_KEYS,
    onSuccess: onDone,
  });
  const directed = (DIRECTED_KINDS as readonly string[]).includes(kind);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || linked.length === 0) return;
    save.mutate({
      kind,
      direction: directed ? direction : null,
      occurredAt: new Date(when).toISOString(),
      bodyMd: body.trim(),
      personIds: linked.map((p) => p.id),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label={t('timeline.kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as EntryKind)}
          className="w-40"
        >
          {ENTRY_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`timeline.kinds.${k}`)}
            </option>
          ))}
        </Select>
        {directed && (
          <Select
            aria-label={t('timeline.directionLabel')}
            value={direction}
            onChange={(e) => setDirection(e.target.value as EntryDirection)}
            className="w-40"
          >
            <option value="out">{t('timeline.direction.out')}</option>
            <option value="in">{t('timeline.direction.in')}</option>
          </Select>
        )}
        <input
          type="datetime-local"
          aria-label={t('timeline.when')}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          required
          className="num h-9.5 rounded-sm border border-input bg-popover px-2.5"
        />
      </div>
      <textarea
        aria-label={t('timeline.text')}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={Math.min(12, Math.max(3, body.split('\n').length + 1))}
        autoFocus
        className="w-full rounded-sm border border-input bg-popover px-2.5 py-2 font-serif text-read focus-visible:border-foreground"
      />
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {linked.map((p) => (
          <span key={p.id} className="flex items-center gap-1 rounded-sm border px-2 py-0.5">
            {p.displayName}
            {linked.length > 1 && (
              <button
                type="button"
                className="cursor-pointer text-muted-foreground hover:text-foreground"
                aria-label={t('tags.removeNamed', { name: p.displayName })}
                onClick={() => setLinked((list) => list.filter((x) => x.id !== p.id))}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <Combobox
          label={t('timeline.addPerson')}
          placeholder={t('timeline.addPerson')}
          className="w-48"
          options={people
            .filter((p) => !linked.some((l) => l.id === p.id))
            .map((p) => ({ value: p.id, label: p.displayName }))}
          onSelect={(o) => {
            const p = people.find((x) => x.id === o.value)!;
            setLinked((list) => [
              ...list,
              {
                id: p.id,
                displayName: p.displayName,
                initials: p.initials,
                spaceId: p.spaceId,
                photoUrl: p.photoUrl,
              },
            ]);
          }}
        />
      </div>
      <FormMessage tone="error">{save.isError && errorMessage(t, save.error)}</FormMessage>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {t('common.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function EntryRow({ entry, viewerId }: { entry: Entry; viewerId?: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const [editing, setEditing] = useState(false);
  const remove = useWrite(() => entriesApi.remove(entry.id), { invalidate: TIMELINE_KEYS });
  const date = new Date(entry.occurredAt);
  const Icon = KIND_ICONS[entry.kind];
  const others = entry.people.filter((p) => p.id !== viewerId);

  if (editing)
    return (
      <li className="border-b">
        <EntryEditForm entry={entry} onDone={() => setEditing(false)} />
      </li>
    );

  return (
    <li className="group grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 border-b py-3 md:grid-cols-[7.5rem_minmax(0,1fr)_auto]">
      <div className="num text-meta">
        <div className="font-bold text-foreground">
          {new Intl.DateTimeFormat(locale, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }).format(date)}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Icon aria-hidden className="size-3.5" />
          {directionArrow(entry.direction)}
          {t(`timeline.kinds.${entry.kind}`)}
        </div>
        <div className="text-muted-foreground">
          {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)}
        </div>
      </div>
      <div className="min-w-0">
        {entry.title && <div className="font-serif text-lg font-semibold">{entry.title}</div>}
        <Markdown>{entry.bodyMd}</Markdown>
        {(others.length > 0 || entry.organization) && (
          <div className="mt-1 text-meta text-muted-foreground">
            {others.length > 0 && (
              <>
                {t('timeline.with')}{' '}
                {others.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ', '}
                    <Link to="/people/$personId" params={{ personId: p.id }} className="underline">
                      {p.displayName}
                    </Link>
                  </span>
                ))}
              </>
            )}
            {entry.organization && (
              <>
                {others.length > 0 && ' · '}
                <Link
                  to="/organizations/$organizationId"
                  params={{ organizationId: entry.organization.id }}
                  className="underline"
                >
                  {entry.organization.name}
                </Link>
              </>
            )}
          </div>
        )}
      </div>
      <div className="col-start-2 flex gap-0.5 md:col-start-3 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <EditButton label={t('timeline.edit')} onClick={() => setEditing(true)} />
        <RemoveButton
          label={t('timeline.delete')}
          title={t('timeline.deleteTitle')}
          description={t('timeline.deleteBody')}
          onConfirm={() => remove.mutate(undefined)}
        />
      </div>
    </li>
  );
}

/** Timeline of a person or an organization: filter, grouped by month, newest first. */
export function Timeline({
  personId,
  organizationId,
  composer,
}: {
  personId?: string;
  organizationId?: string;
  composer?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const [filter, setFilter] = useState<Filter>('all');
  const { data: entries = [], isSuccess } = useQuery(entriesQuery({ personId, organizationId }));

  const counts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(FILTERS) as Filter[]).map((f) => [
          f,
          entries.filter((e) => (FILTERS[f] as readonly string[]).includes(e.kind)).length,
        ]),
      ) as Record<Filter, number>,
    [entries],
  );

  const groups = useMemo(() => {
    const visible = entries.filter((e) => (FILTERS[filter] as readonly string[]).includes(e.kind));
    const byMonth = new Map<string, Entry[]>();
    for (const entry of visible) {
      const d = new Date(entry.occurredAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      byMonth.set(key, [...(byMonth.get(key) ?? []), entry]);
    }
    return [...byMonth.values()];
  }, [entries, filter]);

  return (
    <section aria-label={t('person.timeline')} className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border-strong pb-1">
        <h2 className="kicker">{t('person.timeline')}</h2>
        <div role="group" aria-label={t('timeline.filter')} className="flex gap-3.5 text-sm">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'cursor-pointer pb-0.5',
                filter === f
                  ? 'font-bold text-foreground shadow-[inset_0_-2px_0_var(--foreground)]'
                  : 'text-foreground-2 hover:text-foreground',
              )}
            >
              {t(`timeline.filters.${f}`)}
              {f === 'all' && (
                <span className="num ml-1 font-normal text-muted-foreground">{counts.all}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      {composer && <div className="mt-3">{composer}</div>}
      {isSuccess && entries.length === 0 && (
        <p className="py-4 font-serif text-read text-muted-foreground italic">
          {t('timeline.empty')}
        </p>
      )}
      {groups.map((group) => (
        <div key={group[0]!.id} className="mt-4">
          <h3 className="kicker text-muted-foreground">
            {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
              new Date(group[0]!.occurredAt),
            )}
          </h3>
          <ul>
            {group.map((entry) => (
              <EntryRow key={entry.id} entry={entry} viewerId={personId} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
