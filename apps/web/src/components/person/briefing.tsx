import { Link } from '@tanstack/react-router';
import { Pin, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Person, Reminder } from '@app/shared';
import { FormMessage } from '@/components/form-field';
import { directionArrow } from '@/components/timeline/entry-kind';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { remindersApi, TIMELINE_KEYS, useWrite } from '@/lib/data';
import {
  addDays,
  daysUntil,
  fromDateOnly,
  nextBirthday,
  rhythmStatus,
  toDateOnly,
} from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

function useDueLabel() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  return (dueOn: string) => {
    const days = daysUntil(fromDateOnly(dueOn));
    if (days < 0) return { text: t('briefing.overdue', { count: -days }), due: true };
    if (days === 0) return { text: t('briefing.today'), due: true };
    if (days === 1) return { text: t('briefing.tomorrow'), due: true };
    const date = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    }).format(fromDateOnly(dueOn));
    return { text: date, due: false };
  };
}

/** Open follow-up with a done checkbox; `showPerson` adds who it is about (Today page). */
export function ReminderRow({
  reminder,
  showPerson = false,
}: {
  reminder: Reminder;
  showPerson?: boolean;
}) {
  const { t } = useTranslation();
  const dueLabel = useDueLabel();
  const done = useWrite(() => remindersApi.update(reminder.id, { done: true }), {
    invalidate: TIMELINE_KEYS,
  });
  const label = dueLabel(reminder.dueOn);
  return (
    <li className="flex items-start gap-3 border-b py-2">
      <input
        type="checkbox"
        aria-label={t('briefing.markDone', { title: reminder.title })}
        onChange={() => done.mutate(undefined)}
        disabled={done.isPending}
        className={cn(
          'mt-1 size-4 shrink-0 cursor-pointer accent-foreground',
          label.due && 'accent-signal',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="font-semibold break-words">{reminder.title}</div>
        {showPerson && reminder.person && (
          <Link
            to="/people/$personId"
            params={{ personId: reminder.person.id }}
            className="text-foreground-2 underline"
          >
            {reminder.person.displayName}
          </Link>
        )}
        <div
          className={cn(
            'num text-meta',
            label.due ? 'font-bold text-signal' : 'text-muted-foreground',
          )}
        >
          {label.text}
        </div>
      </div>
    </li>
  );
}

const PRESETS = [1, 7, 14, 30] as const;

function AddReminder({ personId, onDone }: { personId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [preset, setPreset] = useState<string>('7');
  const [date, setDate] = useState(toDateOnly(addDays(new Date(), 7)));
  const add = useWrite(
    (input: { title: string; dueOn: string }) => remindersApi.create(personId, input),
    {
      invalidate: TIMELINE_KEYS,
      onSuccess: onDone,
    },
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const dueOn = preset === 'date' ? date : toDateOnly(addDays(new Date(), Number(preset)));
    add.mutate({ title: title.trim(), dueOn });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-b py-3">
      <Input
        aria-label={t('briefing.reminderTitle')}
        placeholder={t('briefing.reminderTitle')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <div className="flex gap-2">
        <Select
          aria-label={t('briefing.due')}
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          className="flex-1"
        >
          {PRESETS.map((d) => (
            <option key={d} value={d}>
              {t(`timeline.reminderIn.d${d}`)}
            </option>
          ))}
          <option value="date">{t('briefing.onDate')}</option>
        </Select>
        {preset === 'date' && (
          <input
            type="date"
            aria-label={t('briefing.due')}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="num h-9.5 rounded-sm border border-input bg-popover px-2"
          />
        )}
      </div>
      <FormMessage tone="error">{add.isError && errorMessage(t, add.error)}</FormMessage>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={add.isPending || !title.trim()}>
          {t('common.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/**
 * The ten-second view before a call: open follow-ups, pinned facts, last contact,
 * next birthday and the contact rhythm.
 */
export function BriefingCard({ person }: { person: Person }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const [adding, setAdding] = useState(false);
  const pinned = person.facts.filter((f) => f.pinned);
  const birthday = person.birthday ? nextBirthday(person.birthday) : null;
  const rhythm = rhythmStatus(
    person.contactEveryDays,
    person.lastContact?.occurredAt ?? null,
    new Date(),
    person.contactRhythmSince,
  );
  const last = person.lastContact;
  const empty = !pinned.length && !person.reminders.length && !last && !birthday && !rhythm;
  const shortDate = (date: Date) =>
    new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(date);

  return (
    <section aria-label={t('person.briefing')} className="mt-5 md:mt-6">
      <div className="flex items-center justify-between border-b border-border-strong pb-1">
        <h2 className="kicker">{t('person.briefing')}</h2>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setAdding(true)}
          aria-label={t('briefing.addReminder')}
        >
          <Plus aria-hidden />
          <span aria-hidden className="hidden md:inline">
            {t('briefing.reminder')}
          </span>
        </Button>
      </div>

      {empty && !adding && (
        <p className="py-2 text-sm text-muted-foreground">{t('briefing.empty')}</p>
      )}

      <ul>
        {person.reminders.map((reminder) => (
          <ReminderRow key={reminder.id} reminder={reminder} />
        ))}
        {adding && (
          <li>
            <AddReminder personId={person.id} onDone={() => setAdding(false)} />
          </li>
        )}
        {pinned.map((fact) => (
          <li key={fact.id} className="flex items-start gap-3 border-b py-2">
            <Pin
              aria-label={t('facts.pinned')}
              className="mt-1 size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 break-words">{fact.text}</span>
          </li>
        ))}
        {last && (
          <li className="border-b py-2" data-testid="briefing-last-contact">
            <span className="kicker mr-2 text-muted-foreground">{t('briefing.last')}</span>
            <span className="num font-bold">{shortDate(new Date(last.occurredAt))}</span>{' '}
            <span className="text-meta text-muted-foreground">
              {directionArrow(last.direction)}
              {t(`timeline.kinds.${last.kind}`)}
            </span>
            {last.excerpt && <span className="text-foreground-2"> · {last.excerpt}</span>}
          </li>
        )}
        {birthday && person.birthday && (
          <li
            className="flex items-baseline justify-between gap-3 border-b py-2"
            data-testid="briefing-birthday"
          >
            <span>
              {t('person.birthday')} {shortDate(fromDateOnly(`2000-${person.birthday.slice(-5)}`))}
            </span>
            <span className="num text-meta text-muted-foreground">
              {t('person.birthdayIn', { count: birthday.days })}
              {birthday.turns !== null && ` · ${t('person.turns', { age: birthday.turns })}`}
            </span>
          </li>
        )}
        {rhythm && (
          <li
            className="flex items-baseline justify-between gap-3 border-b py-2"
            data-testid="briefing-rhythm"
          >
            <span title={t('briefing.rhythmCounts')}>
              {t('briefing.rhythm', { count: person.contactEveryDays ?? 0 })}
            </span>
            <span className="num text-right text-meta">
              {rhythm.overdueDays ? (
                <span className="block font-bold text-signal">
                  {t('briefing.rhythmOverdue', { count: rhythm.overdueDays })}
                </span>
              ) : rhythm.due ? (
                <span className="block text-muted-foreground">
                  {t('briefing.rhythmNext', { date: shortDate(rhythm.due) })}
                </span>
              ) : null}
              {rhythm.neverContacted && (
                <span className="block text-muted-foreground">
                  {t('briefing.noContactYet')} ·{' '}
                  <Link
                    to="/people/$personId"
                    params={{ personId: person.id }}
                    search={{ compose: 'call' }}
                    className="underline hover:text-foreground"
                  >
                    {t('briefing.logCall')}
                  </Link>
                </span>
              )}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
