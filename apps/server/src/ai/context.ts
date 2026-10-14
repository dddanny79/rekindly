/**
 * What may go to an AI: only people in spaces with “AI allowed”. Every AI feature
 * and the MCP server get their data through here.
 */
import { getAccountRow } from '../auth/account';
import type { Db } from '../db/client';
import { spaces } from '../db/schema';
import { listEntries } from '../entries/service';
import { notDeleted } from '../lib/sql';
import { getPerson } from '../people/service';
import { type Person, personDateLabel } from '@app/shared';

type Locale = 'en' | 'de';

const SEEDED: Record<Locale, Record<string, string>> = {
  en: {
    'seed.spaces.private': 'Private',
    'seed.spaces.business': 'Business',
    'seed.relationshipTypes.partner': 'Partner',
    'seed.relationshipTypes.parent': 'Parent',
    'seed.relationshipTypes.child': 'Child',
    'seed.relationshipTypes.sibling': 'Sibling',
    'seed.relationshipTypes.friend': 'Friend',
    'seed.relationshipTypes.colleague': 'Colleague',
    'seed.relationshipTypes.manager': 'Manager',
    'seed.relationshipTypes.report': 'Report',
  },
  de: {
    'seed.spaces.private': 'Privat',
    'seed.spaces.business': 'Business',
    'seed.relationshipTypes.partner': 'Partner/in',
    'seed.relationshipTypes.parent': 'Elternteil',
    'seed.relationshipTypes.child': 'Kind',
    'seed.relationshipTypes.sibling': 'Geschwister',
    'seed.relationshipTypes.friend': 'Freund/in',
    'seed.relationshipTypes.colleague': 'Kolleg/in',
    'seed.relationshipTypes.manager': 'Vorgesetzte/r',
    'seed.relationshipTypes.report': 'Mitarbeiter/in',
  },
};

export interface ContextOptions {
  db: Db;
  publicUrl: URL;
}

/** Spaces whose data may go to an AI. */
export function aiSpaces(db: Db): Map<string, string> {
  const locale: Locale = getAccountRow(db)?.locale === 'de' ? 'de' : 'en';
  return new Map(
    db
      .select()
      .from(spaces)
      .where(notDeleted(spaces))
      .all()
      .filter((s) => s.aiAllowed)
      .map((s) => [s.id, s.name ?? SEEDED[locale][s.nameKey ?? ''] ?? s.nameKey ?? '']),
  );
}

/** A person or space the AI may not see: to the caller it does not exist. */
export class NotAllowedError extends Error {}

/** A person in an AI-allowed space, else “not found” (the others do not exist here). */
export function allowedPerson(db: Db, id: string, allowed: Map<string, string>): Person {
  let person: Person;
  try {
    person = getPerson(db, id);
  } catch {
    throw new NotAllowedError(`No person with id ${id}.`);
  }
  if (!allowed.has(person.spaceId)) throw new NotAllowedError(`No person with id ${id}.`);
  return person;
}

export const day = (iso: string) => iso.slice(0, 10);
const line = (label: string, value: string | null | undefined) =>
  value ? `- ${label}: ${value}` : null;

/** Everything about a person as Markdown: for MCP answers and as AI context. */
export function personBriefing(ctx: ContextOptions, person: Person, spaceName: string): string {
  const locale: Locale = getAccountRow(ctx.db)?.locale === 'de' ? 'de' : 'en';
  const label = (ref: { name: string | null; nameKey: string | null }) =>
    ref.name ?? SEEDED[locale][ref.nameKey ?? ''] ?? ref.nameKey ?? '';
  const entries = listEntries(ctx.db, { personId: person.id, limit: 15 }).filter(
    (e) => e.source === 'user',
  );
  const parts = [
    `# ${person.displayName}`,
    person.summary,
    [
      line('Space', spaceName),
      line('Link', new URL(`/people/${person.id}`, ctx.publicUrl).toString()),
      line(
        'Organizations',
        person.affiliations
          .map((a) => [a.role, a.organization.name].filter(Boolean).join(' @ '))
          .join('; '),
      ),
      line('Birthday', person.birthday),
      line(
        'Days to remember',
        person.dates.map((d) => `${personDateLabel(d, 'en')} ${d.date}`).join('; '),
      ),
      line('Pronouns', person.pronouns),
      line(
        'Met',
        [
          person.metWhen,
          person.metWhere,
          person.metThrough && `through ${person.metThrough.displayName}`,
        ]
          .filter(Boolean)
          .join(', '),
      ),
      line(
        'Keep in touch',
        person.contactEveryDays ? `every ${person.contactEveryDays} days` : null,
      ),
      line(
        'Last contact',
        person.lastContact &&
          `${day(person.lastContact.occurredAt)} (${person.lastContact.kind}): ${person.lastContact.excerpt}`,
      ),
      line('Tags', person.tags.map((t) => t.name).join(', ')),
      line('Indirect contact', person.listed ? null : 'yes (known through someone else)'),
      line('Archived', person.archivedAt ? 'yes' : null),
    ]
      .filter(Boolean)
      .join('\n'),
    person.contactPoints.length
      ? `## Contact\n${person.contactPoints.map((p) => `- ${p.kind}${p.label ? ` (${p.label})` : ''}: ${p.value}`).join('\n')}`
      : null,
    person.addresses.length
      ? `## Addresses\n${person.addresses
          .map(
            (a) =>
              `- ${[a.label && `${a.label}:`, a.street, [a.zip, a.city].filter(Boolean).join(' '), a.region, a.country].filter(Boolean).join(' ')}`,
          )
          .join('\n')}`
      : null,
    person.facts.length ? `## Facts\n${person.facts.map((f) => `- ${f.text}`).join('\n')}` : null,
    person.questions.length
      ? `## Ask next time\n${person.questions.map((q) => `- ${q.text}`).join('\n')}`
      : null,
    person.reminders.length
      ? `## Open follow-ups\n${person.reminders.map((r) => `- ${r.dueOn}: ${r.title}`).join('\n')}`
      : null,
    person.relationships.length
      ? `## Relationships\n${person.relationships.map((r) => `- ${label(r.label)}: ${r.person.displayName} (id ${r.person.id})`).join('\n')}`
      : null,
    entries.length
      ? `## Recent timeline\n${entries
          .map((e) => {
            const others = e.people.filter((p) => p.id !== person.id).map((p) => p.displayName);
            const text = [e.title, e.bodyMd.trim()]
              .filter(Boolean)
              .join(' — ')
              .replace(/\s+/g, ' ');
            return `- ${day(e.occurredAt)} ${e.kind}${e.direction ? ` (${e.direction})` : ''}${others.length ? ` with ${others.join(', ')}` : ''}: ${text.slice(0, 600)}`;
          })
          .join('\n')}`
      : null,
  ];
  return parts.filter(Boolean).join('\n\n');
}
