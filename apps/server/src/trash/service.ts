import { and, count, eq, inArray, isNotNull, isNull, lt, type SQL } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  entryExcerpt,
  personDisplayName,
  TRASH_RETENTION_DAYS,
  type TrashItem,
  type TrashKind,
} from '@app/shared';
import type { Db } from '../db/client';
import {
  addresses,
  affiliations,
  contactPoints,
  entries,
  entryPeople,
  facts,
  questions,
  personDates,
  fieldDefinitions,
  fieldValues,
  organizations,
  people,
  relationshipTypes,
  relationships,
  reminders,
  spaces,
  tags,
} from '../db/schema';
import { removeFile } from '../files/service';
import { DomainError, notFound } from '../lib/errors';
import { log } from '../lib/log';
import { touchPerson } from '../people/refs';
import { purgeDeletedThemes } from '../themes/service';

const DAY = 86_400_000;
const purgeAt = (deletedAt: string) =>
  new Date(Date.parse(deletedAt) + TRASH_RETENTION_DAYS * DAY).toISOString();

type Table = SQLiteTable & { id: SQLiteColumn; deletedAt: SQLiteColumn };
type Row = Record<string, unknown> & { id: string; deletedAt: string };
type Owner = TrashItem['owner'];

/** Names of all people and organizations (live or not) for owner labels. */
function owners(db: Db) {
  const personRows = db.select().from(people).all();
  const orgRows = db.select().from(organizations).all();
  const person = new Map(personRows.map((p) => [p.id, p]));
  const org = new Map(orgRows.map((o) => [o.id, o]));
  return {
    person,
    org,
    /** The owner if it is not in the trash itself, else undefined. */
    livePerson(id: string | null): Owner | undefined {
      const p = id ? person.get(id) : undefined;
      return p && !p.deletedAt
        ? { type: 'person', id: p.id, name: personDisplayName(p) }
        : undefined;
    },
    liveOrg(id: string | null): Owner | undefined {
      const o = id ? org.get(id) : undefined;
      return o && !o.deletedAt ? { type: 'organization', id: o.id, name: o.name } : undefined;
    },
  };
}
type Owners = ReturnType<typeof owners>;

const item = (
  kind: TrashKind,
  row: { id: string; deletedAt: string | null },
  fields: Partial<Omit<TrashItem, 'kind' | 'id' | 'deletedAt' | 'purgeAt'>>,
): TrashItem => ({
  kind,
  id: row.id,
  label: { name: null, nameKey: null },
  detail: null,
  entry: null,
  owner: null,
  spaceId: null,
  ...fields,
  deletedAt: row.deletedAt!,
  purgeAt: purgeAt(row.deletedAt!),
});

const named = (name: string | null, nameKey: string | null = null) => ({ name, nameKey });

/** Removes timeline entries that no longer belong to anybody (after a purge). */
function removeOrphanEntries(db: Db) {
  db.delete(entries)
    .where(
      and(
        isNull(entries.organizationId),
        // Entries never exist without people; only purges leave them behind.
        inArray(
          entries.id,
          db
            .select({ id: entries.id })
            .from(entries)
            .leftJoin(entryPeople, eq(entryPeople.entryId, entries.id))
            .where(isNull(entryPeople.entryId)),
        ),
      ),
    )
    .run();
}

/** Restoring an item into a trashed space brings the space back too. */
function reviveSpace(db: Db, spaceId: string) {
  db.update(spaces).set({ deletedAt: null }).where(eq(spaces.id, spaceId)).run();
}

interface Kind {
  table: Table;
  /** Visible items: children of trashed parents are hidden (they come back with them). */
  list(db: Db, o: Owners): TrashItem[];
  /** Throws if the item cannot be restored right now. */
  beforeRestore?(db: Db, row: Row, o: Owners): void;
  afterChange?(db: Db, row: Row): void;
  /** Hard delete; returns ids of files to remove. Throws if not possible yet. */
  purge(db: Db, row: Row): string[];
}

const trashed = (table: Table) => isNotNull(table.deletedAt);
const ownerInTrash = () => new DomainError(409, 'owner_in_trash');

function simplePurge(table: Table) {
  return (db: Db, row: Row) => {
    db.delete(table).where(eq(table.id, row.id)).run();
    return [];
  };
}

const touchOwner = (db: Db, row: Row) => {
  if (typeof row.personId === 'string') touchPerson(db, row.personId);
};

/** Child of a person: listed and restorable while the person is live. */
function personChild(
  kind: TrashKind,
  table: Table & { personId: SQLiteColumn },
  describe: (row: never) => { label: TrashItem['label']; detail?: string | null },
): Kind {
  return {
    table,
    list: (db, o) =>
      (db.select().from(table).where(trashed(table)).all() as Row[]).flatMap((row) => {
        const owner = o.livePerson(row.personId as string);
        return owner
          ? [
              item(kind, row, {
                ...describe(row as never),
                owner,
                spaceId: o.person.get(owner.id)!.spaceId,
              }),
            ]
          : [];
      }),
    beforeRestore: (_db, row, o) => {
      if (!o.livePerson(row.personId as string)) throw ownerInTrash();
    },
    afterChange: touchOwner,
    purge: simplePurge(table),
  };
}

const KINDS: Record<TrashKind, Kind> = {
  person: {
    table: people,
    list: (db) =>
      db
        .select()
        .from(people)
        .where(trashed(people))
        .all()
        .map((p) =>
          item('person', p, {
            label: named(personDisplayName(p)),
            detail: p.summary,
            spaceId: p.spaceId,
          }),
        ),
    beforeRestore: (db, row) => reviveSpace(db, row.spaceId as string),
    purge: (db, row) => {
      db.delete(fieldValues).where(eq(fieldValues.targetId, row.id)).run();
      db.delete(people).where(eq(people.id, row.id)).run();
      removeOrphanEntries(db);
      return row.photoFileId ? [row.photoFileId as string] : [];
    },
  },

  organization: {
    table: organizations,
    list: (db) =>
      db
        .select()
        .from(organizations)
        .where(trashed(organizations))
        .all()
        .map((org) =>
          item('organization', org, {
            label: named(org.name),
            detail: org.kind,
            spaceId: org.spaceId,
          }),
        ),
    beforeRestore: (db, row) => reviveSpace(db, row.spaceId as string),
    purge: (db, row) => {
      db.delete(fieldValues).where(eq(fieldValues.targetId, row.id)).run();
      db.delete(organizations).where(eq(organizations.id, row.id)).run();
      removeOrphanEntries(db);
      return [];
    },
  },

  entry: {
    table: entries,
    list: (db, o) => {
      const rows = db.select().from(entries).where(trashed(entries)).all();
      const links = rows.length
        ? db
            .select()
            .from(entryPeople)
            .where(
              inArray(
                entryPeople.entryId,
                rows.map((r) => r.id),
              ),
            )
            .all()
        : [];
      return rows.map((entry) => {
        const personIds = links.filter((l) => l.entryId === entry.id).map((l) => l.personId);
        const owner =
          personIds.map((id) => o.livePerson(id)).find(Boolean) ?? o.liveOrg(entry.organizationId);
        return item('entry', entry, {
          label: named(entry.title),
          detail: entryExcerpt(null, entry.bodyMd),
          entry: { kind: entry.kind, occurredAt: entry.occurredAt },
          owner: owner ?? null,
          spaceId: entry.spaceId,
        });
      });
    },
    beforeRestore: (db, row) => reviveSpace(db, row.spaceId as string),
    afterChange: (db, row) => {
      for (const link of db.select().from(entryPeople).where(eq(entryPeople.entryId, row.id)).all())
        touchPerson(db, link.personId);
    },
    purge: simplePurge(entries),
  },

  reminder: {
    table: reminders,
    list: (db, o) =>
      db
        .select()
        .from(reminders)
        .where(trashed(reminders))
        .all()
        .flatMap((r) => {
          const owner = r.personId ? o.livePerson(r.personId) : null;
          if (owner === undefined) return [];
          return [
            item('reminder', r, {
              label: named(r.title),
              detail: r.dueAt.slice(0, 10),
              owner,
              spaceId: owner ? o.person.get(owner.id)!.spaceId : null,
            }),
          ];
        }),
    beforeRestore: (_db, row, o) => {
      if (row.personId && !o.livePerson(row.personId as string)) throw ownerInTrash();
    },
    afterChange: touchOwner,
    purge: simplePurge(reminders),
  },

  fact: personChild('fact', facts, (f: typeof facts.$inferSelect) => ({ label: named(f.text) })),
  question: personChild('question', questions, (q: typeof questions.$inferSelect) => ({
    label: named(q.text),
  })),
  personDate: personChild('personDate', personDates, (d: typeof personDates.$inferSelect) => ({
    // Days without an own label are named by their kind (translated in the app).
    label: named(d.label, d.label ? null : `personDates.kinds.${d.kind}`),
    detail: d.date,
  })),

  contactPoint: personChild(
    'contactPoint',
    contactPoints,
    (c: typeof contactPoints.$inferSelect) => ({
      label: named(c.value),
      detail: c.label,
    }),
  ),

  address: {
    table: addresses,
    list: (db, o) =>
      db
        .select()
        .from(addresses)
        .where(trashed(addresses))
        .all()
        .flatMap((a) => {
          const owner = a.personId ? o.livePerson(a.personId) : o.liveOrg(a.organizationId);
          if (!owner) return [];
          const spaceId =
            owner.type === 'person'
              ? o.person.get(owner.id)!.spaceId
              : o.org.get(owner.id)!.spaceId;
          const text = [a.street, [a.zip, a.city].filter(Boolean).join(' '), a.region, a.country]
            .filter((part) => part?.trim())
            .join(', ');
          return [item('address', a, { label: named(text), detail: a.label, owner, spaceId })];
        }),
    beforeRestore: (_db, row, o) => {
      const owner = row.personId
        ? o.livePerson(row.personId as string)
        : o.liveOrg(row.organizationId as string);
      if (!owner) throw ownerInTrash();
    },
    afterChange: touchOwner,
    purge: simplePurge(addresses),
  },

  affiliation: {
    table: affiliations,
    list: (db, o) =>
      db
        .select()
        .from(affiliations)
        .where(trashed(affiliations))
        .all()
        .flatMap((a) => {
          const owner = o.livePerson(a.personId);
          const org = o.liveOrg(a.organizationId);
          if (!owner || !org) return [];
          return [
            item('affiliation', a, {
              label: named(org.name),
              detail: a.role,
              owner,
              spaceId: o.person.get(owner.id)!.spaceId,
            }),
          ];
        }),
    beforeRestore: (_db, row, o) => {
      if (!o.livePerson(row.personId as string) || !o.liveOrg(row.organizationId as string))
        throw ownerInTrash();
    },
    afterChange: touchOwner,
    purge: simplePurge(affiliations),
  },

  relationship: {
    table: relationships,
    list: (db, o) =>
      db
        .select()
        .from(relationships)
        .where(trashed(relationships))
        .all()
        .flatMap((r) => {
          const owner = o.livePerson(r.fromPersonId);
          const other = o.livePerson(r.toPersonId);
          if (!owner || !other) return [];
          return [
            item('relationship', r, {
              label: named(other.name),
              detail: r.note,
              owner,
              spaceId: o.person.get(owner.id)!.spaceId,
            }),
          ];
        }),
    beforeRestore: (_db, row, o) => {
      if (!o.livePerson(row.fromPersonId as string) || !o.livePerson(row.toPersonId as string))
        throw ownerInTrash();
    },
    afterChange: (db, row) => {
      touchPerson(db, row.fromPersonId as string);
      touchPerson(db, row.toPersonId as string);
    },
    purge: simplePurge(relationships),
  },

  tag: {
    table: tags,
    list: (db) =>
      db
        .select()
        .from(tags)
        .where(trashed(tags))
        .all()
        .map((tag) => item('tag', tag, { label: named(`#${tag.name}`) })),
    beforeRestore: (db, row) => {
      const name = (row.name as string).toLowerCase();
      const live = db.select({ name: tags.name }).from(tags).where(isNull(tags.deletedAt)).all();
      if (live.some((tag) => tag.name.toLowerCase() === name))
        throw new DomainError(409, 'tag_exists');
    },
    purge: simplePurge(tags),
  },

  fieldDefinition: {
    table: fieldDefinitions,
    list: (db) =>
      db
        .select()
        .from(fieldDefinitions)
        .where(trashed(fieldDefinitions))
        .all()
        .map((f) => item('fieldDefinition', f, { label: named(f.label), detail: f.target })),
    purge: simplePurge(fieldDefinitions),
  },

  relationshipType: {
    table: relationshipTypes,
    list: (db) =>
      db
        .select()
        .from(relationshipTypes)
        .where(trashed(relationshipTypes))
        .all()
        .map((r) => item('relationshipType', r, { label: named(r.name, r.nameKey) })),
    purge: (db, row) => {
      // Existing relationships keep showing a trashed type's name.
      const used = db
        .select({ n: count() })
        .from(relationships)
        .where(eq(relationships.typeId, row.id))
        .get()!.n;
      if (used) throw new DomainError(409, 'relationship_type_in_use');
      db.delete(relationshipTypes).where(eq(relationshipTypes.id, row.id)).run();
      return [];
    },
  },

  space: {
    table: spaces,
    list: (db) =>
      db
        .select()
        .from(spaces)
        .where(trashed(spaces))
        .all()
        .map((s) => item('space', s, { label: named(s.name, s.nameKey), spaceId: s.id })),
    purge: (db, row) => {
      // Trashed people, organizations or entries may still belong to it.
      const used = [people, organizations, entries].some(
        (table) =>
          db.select({ n: count() }).from(table).where(eq(table.spaceId, row.id)).get()!.n > 0,
      );
      if (used) throw new DomainError(409, 'space_not_empty');
      db.delete(spaces).where(eq(spaces.id, row.id)).run();
      return [];
    },
  },
};

export function listTrash(db: Db): TrashItem[] {
  const o = owners(db);
  return Object.values(KINDS)
    .flatMap((kind) => kind.list(db, o))
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

function trashedRow(db: Db, kind: TrashKind, id: string): Row {
  const { table } = KINDS[kind];
  const row = db
    .select()
    .from(table)
    .where(and(eq(table.id, id), trashed(table)))
    .get() as Row | undefined;
  if (!row) throw notFound();
  return row;
}

export function restoreItem(db: Db, kind: TrashKind, id: string) {
  const def = KINDS[kind];
  const row = trashedRow(db, kind, id);
  db.transaction(() => {
    def.beforeRestore?.(db, row, owners(db));
    db.update(def.table).set({ deletedAt: null }).where(eq(def.table.id, id)).run();
    def.afterChange?.(db, row);
  });
}

async function removeFiles(db: Db, dataDir: string, fileIds: string[]) {
  for (const id of fileIds) await removeFile(db, dataDir, id);
}

/** Deletes one trashed item for good. */
export async function purgeItem(db: Db, dataDir: string, kind: TrashKind, id: string) {
  const row = trashedRow(db, kind, id);
  const files = db.transaction(() => KINDS[kind].purge(db, row));
  await removeFiles(db, dataDir, files);
}

/**
 * Purges trashed items deleted before `before` (all of them without it), including
 * children hidden with a trashed parent. Items that cannot go yet are kept.
 */
export async function purgeTrash(db: Db, dataDir: string, before?: string) {
  let purged = 0;
  let kept = 0;
  const files: string[] = [];
  // Owners first: their purge takes dependent rows along.
  for (const def of Object.values(KINDS)) {
    const condition: SQL = before
      ? and(trashed(def.table), lt(def.table.deletedAt, before))!
      : trashed(def.table);
    for (const row of db.select().from(def.table).where(condition).all() as Row[]) {
      // Gone already through an owner purged before.
      if (!db.select({ id: def.table.id }).from(def.table).where(eq(def.table.id, row.id)).get())
        continue;
      try {
        files.push(...db.transaction(() => def.purge(db, row)));
        purged++;
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        kept++;
      }
    }
  }
  await removeFiles(db, dataDir, files);
  return { purged, kept };
}

/** The daily job: purge everything older than the retention period. */
export async function purgeExpired(db: Db, dataDir: string, now = new Date()) {
  const before = new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY).toISOString();
  const result = await purgeTrash(db, dataDir, before);
  return { ...result, purged: result.purged + purgeDeletedThemes(db, before) };
}

/** Runs `purgeExpired` now and then once a day. */
export function schedulePurge(db: Db, dataDir: string) {
  const run = () =>
    purgeExpired(db, dataDir)
      .then(({ purged }) => {
        if (purged)
          log.info(`Trash: purged ${purged} items older than ${TRASH_RETENTION_DAYS} days.`);
      })
      .catch((error: unknown) => log.error('trash purge failed', error));
  void run();
  const timer = setInterval(run, DAY);
  timer.unref();
  return () => clearInterval(timer);
}
