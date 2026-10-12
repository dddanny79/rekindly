import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { count, notLike, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { APP_NAME } from '@app/shared';
import type { Db } from '../db/client';
import {
  addresses,
  affiliations,
  contactPoints,
  davExtras,
  entries,
  entryPeople,
  facts,
  fieldDefinitions,
  fieldValues,
  files,
  organizations,
  people,
  personTags,
  relationshipTypes,
  relationships,
  reminders,
  settings,
  spaces,
  tags,
} from '../db/schema';
import { DomainError } from '../lib/errors';
import { reindexAll } from '../search/service';
import { APP_VERSION } from '../version';

export const EXPORT_FORMAT = 'rekindly-export';
/** Exports from before the app was named Rekindly. */
const LEGACY_EXPORT_FORMATS = ['personengedaechtnis-export'] as const;
export const EXPORT_VERSION = 1;

/**
 * Exported tables in insert order (parents first). Rows are exported as the
 * database holds them, including the trash; credentials (account, passkeys,
 * sessions, app passwords, calendar links) and derived data (search index,
 * CardDAV cache) are not part of an export.
 */
const TABLES = {
  spaces,
  relationshipTypes,
  tags,
  fieldDefinitions,
  organizations,
  people,
  contactPoints,
  addresses,
  affiliations,
  facts,
  entries,
  entryPeople,
  reminders,
  relationships,
  personTags,
  fieldValues,
  settings,
  davExtras,
} as const satisfies Record<string, SQLiteTable>;

type TableName = keyof typeof TABLES;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  app: { name: string; version: string };
  data: Record<TableName, Record<string, unknown>[]> & {
    /** Photos with their content (base64). */
    files: (Record<string, unknown> & { data: string })[];
  };
}

export async function exportAll(db: Db, dataDir: string): Promise<ExportFile> {
  const data = {} as ExportFile['data'];
  for (const [name, table] of Object.entries(TABLES) as [TableName, SQLiteTable][]) {
    // rowid keeps the order of linked people on entries.
    data[name] = db
      .select()
      .from(table)
      .orderBy(sql`rowid`)
      .all() as Record<string, unknown>[];
  }
  // Backup target and password stay with the instance (they are credentials).
  data.settings = data.settings.filter((row) => !String(row.key).startsWith('backup.'));
  data.files = [];
  for (const row of db.select().from(files).all()) {
    try {
      const content = await readFile(join(dataDir, 'files', row.path));
      data.files.push({ ...row, data: content.toString('base64') });
    } catch {
      // A missing file is skipped; the photo reference stays and shows nothing.
    }
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: { name: APP_NAME, version: APP_VERSION },
    data,
  };
}

/** Import is only allowed into an instance without people, organizations or entries. */
export function isEmpty(db: Db): boolean {
  return [people, organizations, entries].every(
    (table) => db.select({ n: count() }).from(table).get()!.n === 0,
  );
}

const rowsSchema = z.array(z.record(z.string(), z.unknown()));
const fileSchema = z
  .object({
    id: z.string(),
    path: z.string().regex(/^[A-Za-z0-9._-]+$/),
    sha256: z.string(),
    data: z.string(),
  })
  .passthrough();
const importSchema = z.object({
  format: z.enum([EXPORT_FORMAT, ...LEGACY_EXPORT_FORMATS]),
  version: z.number().int(),
  data: z.record(z.string(), z.unknown()),
});

function chunks<T>(list: T[], size = 200): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += size) result.push(list.slice(i, i + size));
  return result;
}

/**
 * Restores an export into an empty instance (the account stays as it is). The
 * seeded spaces and relationship types are replaced by the exported ones.
 */
export async function importAll(db: Db, dataDir: string, input: unknown) {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) throw new DomainError(400, 'invalid_export');
  const file = parsed.data;
  if (file.version > EXPORT_VERSION) throw new DomainError(400, 'export_too_new');
  const tableRows = {} as Record<TableName, Record<string, unknown>[]>;
  for (const name of Object.keys(TABLES) as TableName[]) {
    const result = rowsSchema.safeParse(file.data[name] ?? []);
    if (!result.success) throw new DomainError(400, 'invalid_export');
    tableRows[name] = result.data;
  }
  const photos = z.array(fileSchema).safeParse(file.data.files ?? []);
  if (!photos.success) throw new DomainError(400, 'invalid_export');
  if (!isEmpty(db)) throw new DomainError(409, 'not_empty');

  // Photos first; removed again if the import fails.
  const written: string[] = [];
  const fileRows: Record<string, unknown>[] = [];
  try {
    for (const f of photos.data) {
      const content = Buffer.from(f.data, 'base64');
      if (createHash('sha256').update(content).digest('hex') !== f.sha256) {
        throw new DomainError(400, 'invalid_export');
      }
      const target = join(dataDir, 'files', f.path);
      await writeFile(target, content);
      written.push(target);
      const row: Record<string, unknown> = { ...f };
      delete row.data;
      fileRows.push(row);
    }

    const sqlite = db.$client;
    sqlite.transaction(() => {
      // References are checked at the end, so the order inside does not matter.
      sqlite.pragma('defer_foreign_keys = ON');
      // The backup configuration of this instance stays (needed to restore from a target).
      db.delete(settings).where(notLike(settings.key, 'backup.%')).run();
      for (const table of [fieldDefinitions, tags, relationshipTypes, spaces]) {
        db.delete(table).run();
      }
      for (const chunk of chunks(fileRows))
        db.insert(files)
          .values(chunk as never)
          .run();
      for (const [name, table] of Object.entries(TABLES) as [TableName, SQLiteTable][]) {
        const list =
          name === 'settings'
            ? tableRows.settings.filter((row) => !String(row.key).startsWith('backup.'))
            : tableRows[name];
        for (const chunk of chunks(list)) {
          db.insert(table)
            .values(chunk as never)
            .run();
        }
      }
    })();
  } catch (error) {
    for (const path of written) await rm(path, { force: true });
    if (error instanceof DomainError) throw error;
    throw new DomainError(400, 'invalid_export');
  }

  reindexAll(db);
  return {
    ...Object.fromEntries(Object.entries(tableRows).map(([name, list]) => [name, list.length])),
    files: fileRows.length,
  } as Record<TableName | 'files', number>;
}
