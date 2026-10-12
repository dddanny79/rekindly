import { inArray } from 'drizzle-orm';
import {
  findTokenRanges,
  matchedTokens,
  SEARCH_FIELDS,
  SEARCH_MIN_LENGTH,
  type SearchMatch,
  type SearchResponse,
  type SearchResult,
  searchTokens,
  snippet,
} from '@app/shared';
import type { z } from 'zod';
import type { searchQuerySchema } from '@app/shared';
import type { Db } from '../db/client';
import { affiliations, fieldValues, personTags } from '../db/schema';
import { OrgIndex } from '../organizations';
import { livePeopleByIds, toPersonRef } from '../people/refs';
import { relatedToFor } from '../people/related';
import { personSubtitles } from '../people/service';
import {
  buildOrganizationDocuments,
  buildPersonDocuments,
  loadContext,
  type SearchDocument,
  type StoredField,
} from './document';

type In<T extends z.ZodType> = z.output<T>;

/** bm25 weights of the FTS columns name, details, notes: name > facts/roles > notes. */
const WEIGHTS = [10.0, 4.0, 1.0];

function writeDocuments(
  db: Db,
  entityType: SearchDocument['entityType'],
  ids: Iterable<string>,
  docs: SearchDocument[],
) {
  const sqlite = db.$client;
  const find = sqlite.prepare(
    'select id from search_documents where entity_type = ? and entity_id = ?',
  );
  const deleteText = sqlite.prepare('delete from search_index where rowid = ?');
  const deleteDoc = sqlite.prepare('delete from search_documents where id = ?');
  const insertDoc = sqlite.prepare(
    'insert into search_documents (entity_type, entity_id, space_id, listed, fields) values (?, ?, ?, ?, ?)',
  );
  const insertText = sqlite.prepare(
    'insert into search_index (rowid, name, details, notes) values (?, ?, ?, ?)',
  );
  for (const id of ids) {
    const existing = find.get(entityType, id) as { id: number } | undefined;
    if (!existing) continue;
    deleteText.run(existing.id);
    deleteDoc.run(existing.id);
  }
  for (const doc of docs) {
    const { lastInsertRowid } = insertDoc.run(
      doc.entityType,
      doc.entityId,
      doc.spaceId,
      doc.listed ? 1 : 0,
      JSON.stringify(doc.fields),
    );
    insertText.run(lastInsertRowid, doc.name, doc.details, doc.notes);
  }
}

/**
 * Rebuilds the documents queued by the triggers (see migration 0004). Runs after
 * every write request and before every search; returns the number of queue items.
 */
export function flushSearchQueue(db: Db): number {
  const sqlite = db.$client;
  return sqlite.transaction(() => {
    const queued = sqlite.prepare('select kind, entity_id as id from search_queue').all() as {
      kind: string;
      id: string;
    }[];
    if (!queued.length) return 0;

    const orgs = OrgIndex.load(db);
    const personIds = new Set<string>();
    const orgIds = new Set<string>();
    const byKind = (kind: string) => queued.filter((q) => q.kind === kind).map((q) => q.id);

    byKind('person').forEach((id) => personIds.add(id));
    byKind('organization').forEach((id) => orgIds.add(id));
    // Renaming or moving an organization changes the path of everything below it.
    const tree = byKind('organization_tree').flatMap((id) => orgs.subtree(id));
    tree.forEach((id) => orgIds.add(id));
    if (tree.length) {
      db.select({ id: affiliations.personId })
        .from(affiliations)
        .where(inArray(affiliations.organizationId, tree))
        .all()
        .forEach(({ id }) => personIds.add(id));
    }
    const tagIds = byKind('tag');
    if (tagIds.length) {
      db.select({ id: personTags.personId })
        .from(personTags)
        .where(inArray(personTags.tagId, tagIds))
        .all()
        .forEach(({ id }) => personIds.add(id));
    }
    const definitionIds = byKind('field_definition');
    if (definitionIds.length) {
      for (const { id } of db
        .select({ id: fieldValues.targetId })
        .from(fieldValues)
        .where(inArray(fieldValues.definitionId, definitionIds))
        .all()) {
        personIds.add(id);
        orgIds.add(id);
      }
    }

    const ctx = loadContext(db, orgs);
    writeDocuments(db, 'person', personIds, buildPersonDocuments(db, ctx, [...personIds]));
    writeDocuments(db, 'organization', orgIds, buildOrganizationDocuments(db, ctx, [...orgIds]));
    sqlite.prepare('delete from search_queue').run();
    return queued.length;
  })();
}

/** Drops the index and builds it again from scratch (CLI `reindex`). */
export function reindexAll(db: Db) {
  const sqlite = db.$client;
  sqlite.transaction(() => {
    sqlite.prepare('delete from search_index').run();
    sqlite.prepare('delete from search_documents').run();
    sqlite.prepare("insert or ignore into search_queue select 'person', id from people").run();
    sqlite
      .prepare("insert or ignore into search_queue select 'organization', id from organizations")
      .run();
  })();
  flushSearchQueue(db);
  const counts = sqlite
    .prepare('select entity_type as type, count(*) as n from search_documents group by entity_type')
    .all() as { type: string; n: number }[];
  return {
    people: counts.find((c) => c.type === 'person')?.n ?? 0,
    organizations: counts.find((c) => c.type === 'organization')?.n ?? 0,
  };
}

/** Phone numbers also match by their digits ("0221555…" finds "0221 555 …"). */
const isPhoneDigits = (field: StoredField, token: string) =>
  field.f === 'contact' && /^\d{3,}$/.test(token) && field.t.replace(/\D/g, '').startsWith(token);

function fieldTokens(field: StoredField, tokens: string[]) {
  const words = matchedTokens(field.t, tokens);
  return [...words, ...tokens.filter((t) => !words.includes(t) && isPhoneDigits(field, t))];
}

const PRIORITY = new Map(SEARCH_FIELDS.map((field, index) => [field, index]));
const priority = (field: StoredField) => PRIORITY.get(field.f) ?? SEARCH_FIELDS.length;

/**
 * Explains a hit: the best fields that together contain the query words, best field
 * first (name, then roles and facts, timeline last), each with a highlighted excerpt.
 */
export function explainMatches(fields: StoredField[], tokens: string[], max = 3): SearchMatch[] {
  const candidates = fields
    .map((field, index) => ({ field, index, tokens: fieldTokens(field, tokens) }))
    .filter((c) => c.tokens.length > 0)
    .sort(
      (a, b) =>
        priority(a.field) - priority(b.field) ||
        b.tokens.length - a.tokens.length ||
        a.index - b.index,
    );
  const covered = new Set<string>();
  const chosen: StoredField[] = [];
  for (const candidate of candidates) {
    if (candidate.tokens.every((token) => covered.has(token))) continue;
    candidate.tokens.forEach((token) => covered.add(token));
    chosen.push(candidate.field);
  }
  return chosen.slice(0, max).map((field) => {
    const ranges = tokens.some((token) => isPhoneDigits(field, token))
      ? ([[0, field.t.length]] as [number, number][])
      : findTokenRanges(field.t, tokens);
    const excerpt =
      field.f === 'name' ? { text: field.t, highlights: ranges } : snippet(field.t, ranges, 160);
    return {
      field: field.f,
      label: field.l ?? null,
      entry: field.e ? { id: field.e[0], kind: field.e[1], occurredAt: field.e[2] } : null,
      text: excerpt.text,
      highlights: excerpt.highlights,
    };
  });
}

interface Row {
  type: 'person' | 'organization';
  id: string;
  spaceId: string;
  fields: string;
}

export function search(db: Db, query: In<typeof searchQuerySchema>): SearchResponse {
  const started = performance.now();
  flushSearchQueue(db);
  const tokens = searchTokens(query.q);
  const took = () => Math.round((performance.now() - started) * 10) / 10;
  if (!tokens.some((token) => token.length >= SEARCH_MIN_LENGTH)) {
    return { results: [], hasMore: false, tookMs: took() };
  }

  // Every word must occur, each as the start of a word.
  const conditions = ['search_index match ?'];
  const params: unknown[] = [tokens.map((token) => `"${token}"*`).join(' ')];
  if (query.spaceId) {
    conditions.push('d.space_id = ?');
    params.push(query.spaceId);
  }
  if (query.type) {
    conditions.push('d.entity_type = ?');
    params.push(query.type);
  }
  if (query.tagId) {
    conditions.push(
      "d.entity_type = 'person' and d.entity_id in (select person_id from person_tags where tag_id = ?)",
    );
    params.push(query.tagId);
  }
  if (query.organizationId) {
    const subtree = JSON.stringify(OrgIndex.load(db).subtree(query.organizationId));
    conditions.push(
      `((d.entity_type = 'organization' and d.entity_id in (select value from json_each(?)))
        or (d.entity_type = 'person' and d.entity_id in (
          select person_id from affiliations
          where deleted_at is null and organization_id in (select value from json_each(?)))))`,
    );
    params.push(subtree, subtree);
  }
  const limit = query.limit ?? 20;
  const rows = db.$client
    .prepare(
      `select d.entity_type as type, d.entity_id as id, d.space_id as spaceId, d.fields as fields
       from search_index join search_documents d on d.id = search_index.rowid
       where ${conditions.join(' and ')}
       -- Indirect contacts after contacts, then by relevance.
       order by d.listed desc, bm25(search_index, ${WEIGHTS.join(', ')})
       limit ?`,
    )
    .all(...params, limit + 1) as Row[];
  const page = rows.slice(0, limit);

  const personIds = page.filter((r) => r.type === 'person').map((r) => r.id);
  const people = livePeopleByIds(db, personIds);
  const subtitles = personSubtitles(db, [...people.values()]);
  const related = relatedToFor(
    db,
    [...people.values()].filter((p) => !p.listed).map((p) => p.id),
  );
  const orgs = OrgIndex.load(db);

  const results = page.flatMap((row): SearchResult[] => {
    const matches = explainMatches(JSON.parse(row.fields) as StoredField[], tokens);
    if (row.type === 'person') {
      const person = people.get(row.id);
      if (!person) return [];
      return [
        {
          type: 'person',
          id: person.id,
          spaceId: person.spaceId,
          person: toPersonRef(person),
          subtitle: subtitles.get(person.id) ?? null,
          archived: !!person.archivedAt,
          relatedTo: related.get(person.id) ?? null,
          matches,
        },
      ];
    }
    const organization = orgs.ref(row.id);
    if (!organization) return [];
    return [
      {
        type: 'organization',
        id: row.id,
        spaceId: row.spaceId,
        organization,
        matches,
      },
    ];
  });

  return { results, hasMore: rows.length > limit, tookMs: took() };
}

/** Number of indexed people or organizations. */
export const searchDocumentCount = (db: Db, entityType: SearchDocument['entityType']) =>
  (
    db.$client
      .prepare('select count(*) as n from search_documents where entity_type = ?')
      .get(entityType) as { n: number }
  ).n;
