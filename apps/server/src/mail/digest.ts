/**
 * The daily summary mail: due follow-ups, coming birthdays and other recurring days,
 * people overdue to contact.
 */
import { personDateLabel } from '@app/shared';
import { getAccountRow } from '../auth/account';
import type { Db } from '../db/client';
import { log } from '../lib/log';
import { getToday } from '../today/service';
import {
  mailReady,
  mailSettings,
  markFailed,
  markSent,
  readMailStatus,
  smtpConfig,
  updateMailStatus,
  type MailEnv,
} from './config';
import { htmlMail, sendMail, type Mail } from './send';

type Locale = 'en' | 'de';

const TEXT = {
  en: {
    subject: (n: number) => `Today: ${n} ${n === 1 ? 'thing' : 'things'} to keep in mind`,
    title: 'Today',
    due: 'Due follow-ups',
    overdueBy: (n: number) => `overdue by ${n} ${n === 1 ? 'day' : 'days'}`,
    birthdays: 'Birthdays and other days',
    birthday: 'Birthday',
    today: 'today',
    tomorrow: 'tomorrow',
    inDays: (n: number) => `in ${n} days`,
    turns: (n: number) => `turns ${n}`,
    years: (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`,
    yearsSince: (n: number) => `${n} ${n === 1 ? 'year' : 'years'} ago`,
    overdue: 'Long time no talk',
    never: 'no contact yet',
    last: (d: string) => `last ${d}`,
    footer: 'Daily summary from Rekindly · switch it off under Settings → Mail.',
    test: 'Test mail',
    testBody: 'If you can read this, sending mail works.',
  },
  de: {
    subject: (n: number) => `Heute: ${n} ${n === 1 ? 'Sache' : 'Sachen'} im Blick`,
    title: 'Heute',
    due: 'Fällige Wiedervorlagen',
    overdueBy: (n: number) => `seit ${n} ${n === 1 ? 'Tag' : 'Tagen'} fällig`,
    birthdays: 'Geburtstage und Jahrestage',
    birthday: 'Geburtstag',
    today: 'heute',
    tomorrow: 'morgen',
    inDays: (n: number) => `in ${n} Tagen`,
    turns: (n: number) => `wird ${n}`,
    years: (n: number) => `${n} ${n === 1 ? 'Jahr' : 'Jahre'}`,
    yearsSince: (n: number) => `seit ${n} ${n === 1 ? 'Jahr' : 'Jahren'}`,
    overdue: 'Lange nicht gesprochen',
    never: 'noch kein Kontakt',
    last: (d: string) => `zuletzt ${d}`,
    footer: 'Tägliche Zusammenfassung von Rekindly · abschaltbar unter Einstellungen → Mail.',
    test: 'Testmail',
    testBody: 'Wenn du das liest, funktioniert der Mailversand.',
  },
} as const;

export const localeOf = (db: Db): Locale => (getAccountRow(db)?.locale === 'de' ? 'de' : 'en');

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** The summary for a day, or null if nothing is due. Birthdays and other days: the next 7 days. */
export function buildDigest(db: Db, publicUrl: URL, now = new Date()): Mail | null {
  const locale = localeOf(db);
  const t = TEXT[locale];
  const date = localDate(now);
  const today = getToday(db, { date });
  const link = (personId: string) => new URL(`/people/${personId}`, publicUrl).toString();
  const reminders = today.reminders.map((r) => {
    const late = daysBetween(r.dueOn, date);
    return {
      text: `${r.title}${r.person ? ` — ${r.person.displayName}` : ''}${late > 0 ? ` (${t.overdueBy(late)})` : ''}`,
      href: r.person ? link(r.person.id) : undefined,
    };
  });
  const when = (days: number) => (days === 0 ? t.today : days === 1 ? t.tomorrow : t.inDays(days));
  // Birthdays and other recurring days in one list, soonest first. Memorial days
  // count the years since, without any congratulating tone.
  const birthdays = [
    ...today.birthdays.map((b) => ({
      inDays: b.inDays,
      text: `${b.person.displayName} — ${t.birthday}, ${when(b.inDays)}${b.turns ? `, ${t.turns(b.turns)}` : ''}`,
      href: link(b.person.id),
    })),
    ...today.dates.map((d) => ({
      inDays: d.inDays,
      text: `${d.person.displayName} — ${personDateLabel(d, locale)}, ${when(d.inDays)}${d.years ? `, ${d.kind === 'memorial' ? t.yearsSince(d.years) : t.years(d.years)}` : ''}`,
      href: link(d.person.id),
    })),
  ]
    .filter((b) => b.inDays <= 7)
    .sort((a, b) => a.inDays - b.inDays)
    .map(({ text, href }) => ({ text, href }));
  const overdue = today.overdueContacts.map((o) => ({
    text: `${o.person.displayName} — ${o.lastContactAt ? t.last(o.lastContactAt.slice(0, 10)) : t.never}`,
    href: link(o.person.id),
  }));
  const count = reminders.length + birthdays.length + overdue.length;
  if (!count) return null;
  const blocks = [
    { heading: t.due, lines: reminders },
    { heading: t.birthdays, lines: birthdays },
    { heading: t.overdue, lines: overdue },
  ].filter((b) => b.lines.length);
  const text = [
    `${t.title} · ${date}`,
    ...blocks.map(
      (b) =>
        `\n${b.heading}\n${b.lines.map((l) => `- ${l.text}${l.href ? `\n  ${l.href}` : ''}`).join('\n')}`,
    ),
    `\n--\n${t.footer}`,
  ].join('\n');
  return {
    subject: t.subject(count),
    text,
    html: htmlMail(`${t.title} · ${date}`, blocks, t.footer),
  };
}

export function testMail(db: Db): Mail {
  const t = TEXT[localeOf(db)];
  return {
    subject: `Rekindly: ${t.test}`,
    text: t.testBody,
    html: htmlMail(t.test, [{ lines: [{ text: t.testBody }] }], 'Rekindly'),
  };
}

export interface MailContext {
  db: Db;
  key: Buffer;
  env: MailEnv;
  publicUrl: URL;
}

/** Sends a mail and records the result in the mail status. */
export async function deliver(ctx: MailContext, mail: Mail) {
  try {
    await sendMail(smtpConfig(ctx.db, ctx.key, ctx.env), mail);
    markSent(ctx.db);
  } catch (error) {
    markFailed(ctx.db, (error as { detail?: string }).detail ?? (error as Error).message);
    throw error;
  }
}

/** Sends today's summary now. Returns false if there was nothing to send. */
export async function sendDigest(ctx: MailContext, now = new Date()): Promise<boolean> {
  const mail = buildDigest(ctx.db, ctx.publicUrl, now);
  if (mail) await deliver(ctx, mail);
  updateMailStatus(ctx.db, { lastDigestOn: localDate(now) });
  return !!mail;
}

/** Whether the summary is due: enabled, set up, after the hour, not yet today; after a failure retry hourly. */
export function digestDue(db: Db, env: MailEnv, now = new Date()) {
  const settings = mailSettings(db, env);
  if (!settings.digest.enabled || !mailReady(db, env)) return false;
  if (now.getHours() < settings.digest.hour) return false;
  const status = readMailStatus(db);
  if (status.lastDigestOn === localDate(now)) return false;
  if (status.lastErrorAt && now.getTime() - Date.parse(status.lastErrorAt) < 60 * 60 * 1000)
    return false;
  return true;
}

/** Checks every ten minutes whether the daily summary is due. */
export function scheduleDigest(ctx: MailContext) {
  let running = false;
  const tick = () => {
    if (running || !digestDue(ctx.db, ctx.env)) return;
    running = true;
    void sendDigest(ctx)
      .catch((error) => log.error('Daily summary mail failed', error))
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(tick, 10 * 60 * 1000);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
