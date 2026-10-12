/**
 * The MCP tools: read the memory (search, briefing, today) and, with a write
 * token, log an interaction or add a follow-up. Only spaces with “AI allowed”
 * are visible: what a tool returns goes to the assistant's AI provider.
 */
import { z } from 'zod';
import type { Person } from '@app/shared';
import { getAccountRow } from '../auth/account';
import type { Db } from '../db/client';
import { spaces } from '../db/schema';
import { createEntry, listEntries } from '../entries/service';
import { DomainError } from '../lib/errors';
import { notDeleted } from '../lib/sql';
import { getPerson } from '../people/service';
import { addReminder } from '../reminders/service';
import { search } from '../search/service';
import { getToday } from '../today/service';

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

export interface ToolContext {
  db: Db;
  write: boolean;
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

class ToolError extends Error {}

/** A person in an AI-allowed space, else “not found” (the others do not exist here). */
function allowedPerson(db: Db, id: string, allowed: Map<string, string>): Person {
  let person: Person;
  try {
    person = getPerson(db, id);
  } catch {
    throw new ToolError(`No person with id ${id}.`);
  }
  if (!allowed.has(person.spaceId)) throw new ToolError(`No person with id ${id}.`);
  return person;
}

const day = (iso: string) => iso.slice(0, 10);
const line = (label: string, value: string | null | undefined) =>
  value ? `- ${label}: ${value}` : null;

function briefing(ctx: ToolContext, person: Person, spaceName: string): string {
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

// Definitions --------------------------------------------------------------------------

const searchInput = z.object({
  query: z.string().trim().min(1).max(200).describe('Name, company, or any words from notes'),
  limit: z.number().int().min(1).max(50).optional(),
});
const personInput = z.object({
  person_id: z.string().min(1).describe('Id from search_people'),
});
const logInput = z.object({
  person_id: z.string().min(1),
  kind: z.enum(['note', 'call', 'meeting', 'message']).describe('note, call, meeting or message'),
  text: z.string().trim().min(1).max(20_000).describe('Markdown text of the note'),
  title: z.string().trim().max(200).optional(),
  direction: z.enum(['in', 'out']).optional().describe('For calls and messages: in or out'),
  occurred_at: z.string().datetime().optional().describe('ISO 8601; default now'),
  also_person_ids: z.array(z.string()).max(20).optional().describe('Other people who were there'),
});
const followUpInput = z.object({
  person_id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  due_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('YYYY-MM-DD'),
});

interface Tool {
  name: string;
  title: string;
  description: string;
  input: z.ZodType;
  write: boolean;
  run: (ctx: ToolContext, args: never) => string;
}

export const TOOLS: Tool[] = [
  {
    name: 'search_people',
    title: 'Search people',
    description:
      'Find people in the personal relationship memory by name, organization, or words from notes and facts. Returns ids for get_person_briefing.',
    input: searchInput,
    write: false,
    run: (ctx, args: z.infer<typeof searchInput>) => {
      const allowed = aiSpaces(ctx.db);
      const results = search(ctx.db, { q: args.query, type: 'person', limit: 100 })
        .results.filter((r) => r.type === 'person' && allowed.has(r.spaceId))
        .slice(0, args.limit ?? 10);
      if (!results.length) return `No people found for “${args.query}”.`;
      return results
        .map((r) => {
          if (r.type !== 'person') return '';
          const match = r.matches[0];
          return `- ${r.person.displayName} (id ${r.id})${r.subtitle ? ` — ${r.subtitle}` : ''}${match ? ` · found in ${match.field}: ${match.text}` : ''}`;
        })
        .join('\n');
    },
  },
  {
    name: 'get_person_briefing',
    title: 'Person briefing',
    description:
      'Everything known about a person: who they are, organizations, contact details, facts, open follow-ups, relationships and recent conversations. Use before a call or meeting, or to answer “what do I know about X?”.',
    input: personInput,
    write: false,
    run: (ctx, args: z.infer<typeof personInput>) => {
      const allowed = aiSpaces(ctx.db);
      const person = allowedPerson(ctx.db, args.person_id, allowed);
      return briefing(ctx, person, allowed.get(person.spaceId) ?? '');
    },
  },
  {
    name: 'get_today',
    title: 'Today',
    description:
      'Follow-ups due today or overdue, upcoming birthdays (14 days) and people one is overdue to contact.',
    input: z.object({}),
    write: false,
    run: (ctx) => {
      const allowed = aiSpaces(ctx.db);
      const today = getToday(ctx.db, {});
      const ok = (ref: { spaceId: string } | null | undefined) => !!ref && allowed.has(ref.spaceId);
      const reminders = today.reminders.filter((r) => ok(r.person));
      const birthdays = today.birthdays.filter((b) => ok(b.person));
      const overdue = today.overdueContacts.filter((o) => ok(o.person));
      return [
        `Date: ${today.date}`,
        `## Due follow-ups\n${reminders.map((r) => `- ${r.dueOn}: ${r.title} — ${r.person!.displayName} (id ${r.person!.id})`).join('\n') || '- none'}`,
        `## Birthdays\n${birthdays.map((b) => `- ${b.on} (in ${b.inDays} days): ${b.person.displayName}${b.turns ? `, turns ${b.turns}` : ''}`).join('\n') || '- none'}`,
        `## Overdue to contact\n${overdue.map((o) => `- ${o.person.displayName} (every ${o.contactEveryDays} days, last ${o.lastContactAt ? day(o.lastContactAt) : 'never'})`).join('\n') || '- none'}`,
      ].join('\n\n');
    },
  },
  {
    name: 'log_interaction',
    title: 'Log a note or call',
    description:
      'Add a note, call, meeting or message to a person’s timeline (Markdown). Use after a conversation.',
    input: logInput,
    write: true,
    run: (ctx, args: z.infer<typeof logInput>) => {
      const allowed = aiSpaces(ctx.db);
      const ids = [args.person_id, ...(args.also_person_ids ?? [])];
      const people = ids.map((id) => allowedPerson(ctx.db, id, allowed));
      const entry = createEntry(ctx.db, {
        kind: args.kind,
        bodyMd: args.text,
        title: args.title ?? null,
        direction:
          args.kind === 'call' || args.kind === 'message' ? (args.direction ?? null) : null,
        occurredAt: args.occurred_at,
        personIds: people.map((p) => p.id),
      });
      return `Saved ${entry.kind} on ${day(entry.occurredAt)} for ${people.map((p) => p.displayName).join(', ')}.`;
    },
  },
  {
    name: 'add_follow_up',
    title: 'Add a follow-up',
    description: 'Create a follow-up (reminder) for a person on a date.',
    input: followUpInput,
    write: true,
    run: (ctx, args: z.infer<typeof followUpInput>) => {
      const person = allowedPerson(ctx.db, args.person_id, aiSpaces(ctx.db));
      const reminder = addReminder(ctx.db, person.id, { title: args.title, dueOn: args.due_on });
      return `Follow-up “${reminder.title}” for ${person.displayName} on ${reminder.dueOn}.`;
    },
  },
];

/** Runs a tool; errors become a tool result the assistant can read. */
export function callTool(ctx: ToolContext, name: string, rawArgs: unknown) {
  const tool = TOOLS.find((t) => t.name === name && (ctx.write || !t.write));
  if (!tool) return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  const parsed = tool.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        },
      ],
      isError: true,
    };
  }
  try {
    return { content: [{ type: 'text', text: tool.run(ctx, parsed.data as never) }] };
  } catch (error) {
    if (error instanceof ToolError || error instanceof DomainError) {
      return {
        content: [
          {
            type: 'text',
            text: error instanceof DomainError ? `Error: ${error.code}` : error.message,
          },
        ],
        isError: true,
      };
    }
    throw error;
  }
}

export const toolList = (write: boolean) =>
  TOOLS.filter((t) => write || !t.write).map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: z.toJSONSchema(t.input, { target: 'draft-7' }),
    annotations: { readOnlyHint: !t.write, destructiveHint: false, openWorldHint: false },
  }));
