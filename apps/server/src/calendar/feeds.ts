import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  APP_NAME,
  type CalendarFeed,
  createCalendarFeedRequestSchema,
  personDisplayName,
} from '@app/shared';
import { getAccountRow } from '../auth/account';
import type { Db } from '../db/client';
import { calendarFeeds, people } from '../db/schema';
import type { AppEnv, Deps } from '../env';
import { notFound } from '../lib/errors';
import { log } from '../lib/log';
import { notDeleted, nowIso } from '../lib/sql';
import { validate } from '../lib/validate';
import { relatedToFor } from '../people/related';
import { listReminders } from '../reminders/service';
import { getLiveSpace } from '../spaces/service';
import { type AllDayEvent, buildCalendar } from './ics';

type Row = typeof calendarFeeds.$inferSelect;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

const toFeed = (row: Row): CalendarFeed => ({
  id: row.id,
  name: row.name,
  spaceIds: row.spaceIds ?? null,
  includeBirthdays: row.includeBirthdays,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
});

const TEXT = {
  en: { overdue: 'Overdue', birthday: 'Birthday', via: 'via', followUp: 'Follow-up' },
  de: { overdue: 'Überfällig', birthday: 'Geburtstag', via: 'über', followUp: 'Wiedervorlage' },
};

/** Today in the server's time zone (TZ), `YYYY-MM-DD`. */
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * The calendar of a feed: open follow-ups on their due date (overdue ones on
 * today, so they stay visible), optionally birthdays as yearly events.
 */
export function feedCalendar(db: Db, feed: Row, origin: string): string {
  const locale = getAccountRow(db)?.locale === 'de' ? 'de' : 'en';
  const t = TEXT[locale];
  const today = localToday();
  const inSpaces = (spaceId: string | undefined) =>
    !feed.spaceIds || (!!spaceId && feed.spaceIds.includes(spaceId));
  const events: AllDayEvent[] = [];

  for (const r of listReminders(db, { status: 'open' })) {
    if (!inSpaces(r.person?.spaceId)) continue;
    const overdue = r.dueOn < today;
    const who = r.person ? ` – ${r.person.displayName}` : '';
    events.push({
      uid: `reminder-${r.id}@${new URL(origin).host}`,
      date: overdue ? today : r.dueOn,
      summary: `${overdue ? `${t.overdue}: ` : ''}${r.title}${who}`,
      description: `${t.followUp} · ${r.dueOn}`,
      url: r.person ? `${origin}/people/${r.person.id}` : undefined,
      updatedAt: nowIso(),
    });
  }

  if (feed.includeBirthdays) {
    const rows = db
      .select()
      .from(people)
      .where(and(notDeleted(people), isNull(people.archivedAt), isNotNull(people.birthday)))
      .all()
      .filter((p) => inSpaces(p.spaceId));
    const related = relatedToFor(
      db,
      rows.filter((p) => !p.listed).map((p) => p.id),
    );
    for (const p of rows) {
      const birthday = p.birthday!;
      const via = related.get(p.id);
      // A fixed leap year for birthdays without a year (29 Feb stays valid).
      const date = birthday.startsWith('--') ? `2000${birthday.slice(1)}` : birthday;
      events.push({
        uid: `birthday-${p.id}@${new URL(origin).host}`,
        date,
        yearly: true,
        summary: `${t.birthday}: ${personDisplayName(p)}${via ? ` (${t.via} ${via.person.displayName})` : ''}`,
        url: `${origin}/people/${p.id}`,
        updatedAt: p.updatedAt,
      });
    }
  }
  return buildCalendar(`${APP_NAME} · ${feed.name}`, events);
}

export function calendarFeedRoutes({ db, config }: Deps) {
  return new Hono<AppEnv>()
    .get('/', (c) =>
      c.json({
        feeds: db
          .select()
          .from(calendarFeeds)
          .orderBy(desc(calendarFeeds.createdAt))
          .all()
          .map(toFeed),
      }),
    )
    .post('/', validate('json', createCalendarFeedRequestSchema), (c) => {
      const input = c.req.valid('json');
      const spaceIds = input.spaceIds ? [...new Set(input.spaceIds)] : null;
      spaceIds?.forEach((id) => getLiveSpace(db, id));
      const token = randomBytes(24).toString('base64url');
      const row = db
        .insert(calendarFeeds)
        .values({
          id: crypto.randomUUID(),
          name: input.name,
          tokenHash: hash(token),
          spaceIds,
          includeBirthdays: input.includeBirthdays,
        })
        .returning()
        .get();
      return c.json({ feed: toFeed(row), url: `${config.publicUrl.origin}/ics/${token}.ics` }, 201);
    })
    .delete('/:id', (c) => {
      const res = db
        .delete(calendarFeeds)
        .where(eq(calendarFeeds.id, c.req.param('id')))
        .run();
      if (res.changes === 0) throw notFound();
      return c.body(null, 204);
    });
}

/** `GET /ics/<secret>.ics`: the subscription itself (no session, the link is the key). */
export function calendarSubscriptionRoutes({ db, config }: Deps) {
  return new Hono().get('/:file', (c) => {
    const file = c.req.param('file');
    const token = file.endsWith('.ics') ? file.slice(0, -4) : file;
    const feed = db
      .select()
      .from(calendarFeeds)
      .where(eq(calendarFeeds.tokenHash, hash(token)))
      .get();
    if (!feed) return c.text('Not Found', 404);
    if (!feed.lastUsedAt || Date.now() - Date.parse(feed.lastUsedAt) > 60_000) {
      db.update(calendarFeeds)
        .set({ lastUsedAt: nowIso() })
        .where(eq(calendarFeeds.id, feed.id))
        .run();
    }
    log.debug(`Calendar feed "${feed.name}" fetched`);
    return c.body(feedCalendar(db, feed, config.publicUrl.origin), 200, {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'no-store',
    });
  });
}
