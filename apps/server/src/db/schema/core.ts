import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { bool, deletedAt, id, timestamp, timestamps } from './common';

/** A separate area of the data, e.g. Private / Business. */
export const spaces = sqliteTable(
  'spaces',
  {
    id: id(),
    /** User-given name; null for seeded spaces that are shown via `nameKey`. */
    name: text('name'),
    /** i18n key for seeded spaces (e.g. `seed.spaces.private`). */
    nameKey: text('name_key'),
    /** Palette key of the space colour. */
    color: text('color'),
    aiAllowed: bool('ai_allowed').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [check('spaces_name_check', sql`${t.name} is not null or ${t.nameKey} is not null`)],
);

export const files = sqliteTable('files', {
  id: id(),
  /** Path relative to `DATA_DIR/files`. */
  path: text('path').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  createdAt: timestamps.createdAt,
});

export const people = sqliteTable(
  'people',
  {
    id: id(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id),
    firstName: text('first_name'),
    middleName: text('middle_name'),
    lastName: text('last_name'),
    nickname: text('nickname'),
    maidenName: text('maiden_name'),
    prefix: text('prefix'),
    suffix: text('suffix'),
    pronouns: text('pronouns'),
    /** `--MM-DD` or `YYYY-MM-DD` (year optional). */
    birthday: text('birthday'),
    /** One line: who is this? */
    summary: text('summary'),
    metWhere: text('met_where'),
    /** Free date: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
    metWhen: text('met_when'),
    metThroughPersonId: text('met_through_person_id').references((): AnySQLiteColumn => people.id, {
      onDelete: 'set null',
    }),
    photoFileId: text('photo_file_id').references(() => files.id, { onDelete: 'set null' }),
    favorite: bool('favorite').notNull().default(false),
    /** false: indirect contact (known through a relationship), not in the people list. */
    listed: bool('listed').notNull().default(true),
    contactEveryDays: integer('contact_every_days'),
    archivedAt: timestamp('archived_at'),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [
    index('people_space_idx').on(t.spaceId),
    check(
      'people_birthday_check',
      sql`${t.birthday} is null or ${t.birthday} glob '--[0-1][0-9]-[0-3][0-9]' or ${t.birthday} glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`,
    ),
  ],
);

export const contactPoints = sqliteTable(
  'contact_points',
  {
    id: id(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['phone', 'email', 'url', 'messenger', 'social'] }).notNull(),
    label: text('label'),
    value: text('value').notNull(),
    isPrimary: bool('is_primary').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [
    index('contact_points_person_idx').on(t.personId),
    check(
      'contact_points_kind_check',
      sql`${t.kind} in ('phone', 'email', 'url', 'messenger', 'social')`,
    ),
  ],
);

export const organizations = sqliteTable(
  'organizations',
  {
    id: id(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id),
    parentId: text('parent_id').references((): AnySQLiteColumn => organizations.id, {
      onDelete: 'set null',
    }),
    /** company, department, site, club, … (free text with UI suggestions). */
    kind: text('kind'),
    name: text('name').notNull(),
    website: text('website'),
    notes: text('notes'),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [
    index('organizations_space_idx').on(t.spaceId),
    index('organizations_parent_idx').on(t.parentId),
  ],
);

export const addresses = sqliteTable(
  'addresses',
  {
    id: id(),
    personId: text('person_id').references(() => people.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    label: text('label'),
    street: text('street'),
    zip: text('zip'),
    city: text('city'),
    region: text('region'),
    country: text('country'),
    sort: integer('sort').notNull().default(0),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [
    index('addresses_person_idx').on(t.personId),
    index('addresses_organization_idx').on(t.organizationId),
    check('addresses_owner_check', sql`(${t.personId} is null) != (${t.organizationId} is null)`),
  ],
);

export const affiliations = sqliteTable(
  'affiliations',
  {
    id: id(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: text('role'),
    startedOn: text('started_on'),
    endedOn: text('ended_on'),
    isPrimary: bool('is_primary').notNull().default(false),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [
    index('affiliations_person_idx').on(t.personId),
    index('affiliations_organization_idx').on(t.organizationId),
  ],
);

export const facts = sqliteTable(
  'facts',
  {
    id: id(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    pinned: bool('pinned').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [index('facts_person_idx').on(t.personId)],
);

export const entries = sqliteTable(
  'entries',
  {
    id: id(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id),
    kind: text('kind', { enum: ['note', 'call', 'meeting', 'message', 'event'] }).notNull(),
    direction: text('direction', { enum: ['in', 'out'] }),
    occurredAt: timestamp('occurred_at').notNull(),
    title: text('title'),
    bodyMd: text('body_md').notNull().default(''),
    organizationId: text('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    /** `sync`: written by the app to log a change from a CardDAV device. */
    source: text('source', { enum: ['user', 'sync'] })
      .notNull()
      .default('user'),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [
    index('entries_space_occurred_idx').on(t.spaceId, t.occurredAt),
    index('entries_organization_idx').on(t.organizationId),
    check('entries_kind_check', sql`${t.kind} in ('note', 'call', 'meeting', 'message', 'event')`),
    check(
      'entries_direction_check',
      sql`${t.direction} is null or ${t.direction} in ('in', 'out')`,
    ),
  ],
);

export const entryPeople = sqliteTable(
  'entry_people',
  {
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.personId] }),
    index('entry_people_person_idx').on(t.personId),
  ],
);

export const reminders = sqliteTable(
  'reminders',
  {
    id: id(),
    personId: text('person_id').references(() => people.id, { onDelete: 'cascade' }),
    entryId: text('entry_id').references(() => entries.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    dueAt: timestamp('due_at').notNull(),
    doneAt: timestamp('done_at'),
    recurrence: text('recurrence', { enum: ['none', 'yearly'] })
      .notNull()
      .default('none'),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [
    index('reminders_due_idx').on(t.dueAt),
    index('reminders_person_idx').on(t.personId),
    check('reminders_recurrence_check', sql`${t.recurrence} in ('none', 'yearly')`),
  ],
);

export const relationshipTypes = sqliteTable(
  'relationship_types',
  {
    id: id(),
    /** User-given names; null for seeded types that are shown via the keys. */
    name: text('name'),
    reverseName: text('reverse_name'),
    nameKey: text('name_key'),
    reverseNameKey: text('reverse_name_key'),
    /** Same name in both directions (e.g. sibling, friend). */
    symmetric: bool('symmetric').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [
    check('relationship_types_name_check', sql`${t.name} is not null or ${t.nameKey} is not null`),
  ],
);

/**
 * Directed relationship: `to` is `type.name` of `from` (e.g. from = A, to = B,
 * type = parent: B is A's parent). From B's side it reads `type.reverseName` (A is
 * B's child).
 */
export const relationships = sqliteTable(
  'relationships',
  {
    id: id(),
    fromPersonId: text('from_person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    toPersonId: text('to_person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    typeId: text('type_id')
      .notNull()
      .references(() => relationshipTypes.id),
    note: text('note'),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [
    index('relationships_from_idx').on(t.fromPersonId),
    index('relationships_to_idx').on(t.toPersonId),
    check('relationships_not_self_check', sql`${t.fromPersonId} != ${t.toPersonId}`),
  ],
);

export const tags = sqliteTable(
  'tags',
  {
    id: id(),
    name: text('name').notNull(),
    color: text('color'),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('tags_name_unique')
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const personTags = sqliteTable(
  'person_tags',
  {
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.personId, t.tagId] }), index('person_tags_tag_idx').on(t.tagId)],
);

export const fieldDefinitions = sqliteTable(
  'field_definitions',
  {
    id: id(),
    target: text('target', { enum: ['person', 'organization'] }).notNull(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    type: text('type', { enum: ['text', 'number', 'date', 'select', 'boolean', 'url'] }).notNull(),
    /** JSON array of options for `select`. */
    options: text('options', { mode: 'json' }).$type<string[]>(),
    sort: integer('sort').notNull().default(0),
    deletedAt: deletedAt(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('field_definitions_target_key_unique').on(t.target, t.key),
    check('field_definitions_target_check', sql`${t.target} in ('person', 'organization')`),
    check(
      'field_definitions_type_check',
      sql`${t.type} in ('text', 'number', 'date', 'select', 'boolean', 'url')`,
    ),
  ],
);

export const fieldValues = sqliteTable(
  'field_values',
  {
    definitionId: text('definition_id')
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: 'cascade' }),
    /** Person or organization id, depending on the definition's target. */
    targetId: text('target_id').notNull(),
    value: text('value').notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.definitionId, t.targetId] }),
    index('field_values_target_idx').on(t.targetId),
  ],
);

/** Key/value settings (AI provider, sync password, …). Values are JSON. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: timestamps.updatedAt,
});

/** CardDAV sync state per person. */
export const syncStates = sqliteTable(
  'sync_states',
  {
    id: id(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    uid: text('uid').notNull(),
    etag: text('etag').notNull(),
    href: text('href').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('sync_states_uid_unique').on(t.uid),
    uniqueIndex('sync_states_person_unique').on(t.personId),
  ],
);
