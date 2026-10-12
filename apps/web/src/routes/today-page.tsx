import { useState, type ReactElement, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { PersonRef, SpaceColor } from '@app/shared';
import { Avatar } from '@/components/avatar';
import { PageHeader } from '@/components/page-header';
import { ReminderRow } from '@/components/person/briefing';
import { Button } from '@/components/ui/button';
import { todayQuery } from '@/lib/data';
import { fromDateOnly, toDateOnly } from '@/lib/dates';
import { relatedToText } from '@/lib/labels';
import { useSelectedSpace } from '@/lib/space-selection';
import { cn } from '@/lib/utils';

/** Longer lists are cut here (“Show all”), so the page stays short on a phone. */
const SECTION_LIMIT = 7;

function Section({
  title,
  count,
  due = false,
  empty,
  children,
  className,
}: {
  title: string;
  count?: number;
  /** Counter in the signal colour (things that are due). */
  due?: boolean;
  empty: string;
  children: ReactNode[];
  className?: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? children : children.slice(0, SECTION_LIMIT);
  return (
    <section aria-label={title} className={cn('min-w-0', className)}>
      <div className="flex items-baseline justify-between border-b border-border-strong pb-1">
        <h2 className="kicker">{title}</h2>
        {count !== undefined && count > 0 && (
          <span
            className={cn('num text-meta font-bold', due ? 'text-signal' : 'text-muted-foreground')}
          >
            {count}
          </span>
        )}
      </div>
      {children.length ? (
        <>
          <ul>{shown}</ul>
          {children.length > SECTION_LIMIT && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-1 -ml-2.5"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? t('today.showLess') : t('today.showAll', { count: children.length })}
            </Button>
          )}
        </>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function PersonLink({
  person,
  color,
}: {
  person: PersonRef;
  color: SpaceColor | null | undefined;
}) {
  return (
    <Link
      to="/people/$personId"
      params={{ personId: person.id }}
      className="flex min-w-0 items-center gap-2.5 no-underline hover:underline"
    >
      <Avatar initials={person.initials} photoUrl={person.photoUrl} color={color} size={26} />
      <span className="truncate font-semibold">{person.displayName}</span>
    </Link>
  );
}

/** Start page: what is due, upcoming birthdays, who is overdue, recently viewed. */
export function TodayPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const { spaceId, spaces } = useSelectedSpace();
  const date = toDateOnly(new Date());
  const { data } = useQuery(todayQuery({ date, spaceId }));
  const colorOf = (id: string) => spaces.find((s) => s.id === id)?.color;
  const shortDate = (value: Date) =>
    new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(value);
  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );
  const longDate = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fromDateOnly(date));

  return (
    <>
      <PageHeader kicker={longDate} title={t('nav.today')} />

      {data?.backup && (
        <p className="mt-4 border-l-2 border-signal pl-3 text-sm" role="alert">
          <span className="font-semibold text-signal">
            {data.backup.state === 'failed'
              ? t('backup.warningFailed', { date: dateTime(data.backup.at) })
              : t('backup.warningStale', { date: dateTime(data.backup.at) })}
          </span>{' '}
          <Link to="/settings/data" className="underline">
            {t('backup.warningLink')}
          </Link>
        </p>
      )}

      {!data ? (
        <p className="mt-5 text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <>
          <div className="mt-5 grid gap-x-9 gap-y-7 md:mt-6 lg:grid-cols-3">
            <Section
              title={t('today.due')}
              count={data.reminders.length}
              due
              empty={t('today.dueEmpty')}
            >
              {data.reminders.map((reminder) => (
                <ReminderRow key={reminder.id} reminder={reminder} showPerson />
              ))}
            </Section>

            <Section
              title={t('today.birthdays')}
              count={data.birthdays.length}
              empty={t('today.birthdaysEmpty')}
            >
              {data.birthdays.map((b) => (
                <li
                  key={b.person.id}
                  className="flex items-center justify-between gap-3 border-b py-2"
                >
                  <span className="min-w-0">
                    <PersonLink person={b.person} color={colorOf(b.person.spaceId)} />
                    {b.relatedTo && (
                      <span className="mt-0.5 block truncate pl-9 text-meta text-muted-foreground">
                        {relatedToText(t, b.relatedTo)}
                      </span>
                    )}
                  </span>
                  <span className="num shrink-0 text-right text-meta">
                    <span className={cn('font-bold', b.inDays === 0 && 'text-signal')}>
                      {shortDate(fromDateOnly(b.on))}
                    </span>
                    <span className="block text-muted-foreground">
                      {t('person.birthdayIn', { count: b.inDays })}
                      {b.turns !== null && ` · ${t('person.turns', { age: b.turns })}`}
                    </span>
                  </span>
                </li>
              ))}
            </Section>

            <Section
              title={t('today.overdue')}
              count={data.overdueContacts.length}
              empty={t('today.overdueEmpty')}
            >
              {data.overdueContacts.map((o) => (
                <li
                  key={o.person.id}
                  className="flex items-center justify-between gap-3 border-b py-2"
                >
                  <PersonLink person={o.person} color={colorOf(o.person.spaceId)} />
                  <span className="num shrink-0 text-right text-meta">
                    <span className="block font-bold text-signal">
                      {t('briefing.rhythmOverdue', { count: o.overdueDays })}
                    </span>
                    {!o.lastContactAt && (
                      <span className="block text-muted-foreground">
                        {t('briefing.noContactYet')}
                      </span>
                    )}
                    {o.lastContactAt && (
                      <span className="block text-muted-foreground">
                        {t('today.lastContact', { date: shortDate(new Date(o.lastContactAt)) })}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </Section>
          </div>

          <Section
            title={t('today.recent')}
            empty={t('today.recentEmpty')}
            className="mt-8 [&_ul]:grid [&_ul]:gap-x-9 md:[&_ul]:grid-cols-2 lg:[&_ul]:grid-cols-3"
          >
            {data.recent.map((r) => (
              <li key={r.person.id} className="min-w-0 border-b py-2">
                <PersonLink person={r.person} color={colorOf(r.person.spaceId)} />
                {(r.relatedTo || r.subtitle) && (
                  <span className="mt-0.5 block truncate pl-9 text-meta text-muted-foreground">
                    {r.relatedTo ? relatedToText(t, r.relatedTo) : r.subtitle}
                  </span>
                )}
              </li>
            ))}
          </Section>
        </>
      )}
    </>
  );
}
