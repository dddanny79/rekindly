import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { APP_NAME } from '@app/shared';
import { z } from 'zod';
import { cardData } from '../dav/cards';
import { buildVcard } from '../dav/vcard';
import { files, people } from '../db/schema';
import type { AppEnv, Deps } from '../env';
import { DomainError } from '../lib/errors';
import { notDeleted } from '../lib/sql';
import { validate } from '../lib/validate';
import { OrgIndex } from '../organizations';
import { exportAll, importAll, isEmpty } from './service';

const stamp = () => new Date().toISOString().slice(0, 10);
const attachment = (name: string) => `attachment; filename="${name}"`;

export function backupRoutes({ db, config }: Deps) {
  return (
    new Hono<AppEnv>()
      // Everything, as one JSON file (backup; restorable with the import below).
      .get('/export/json', async (c) =>
        c.body(JSON.stringify(await exportAll(db, config.dataDir)), 200, {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': attachment(`personengedaechtnis-export-${stamp()}.json`),
        }),
      )
      // Contacts as vCards for other address books (all, or one space).
      .get(
        '/export/vcf',
        validate('query', z.object({ spaceId: z.string().optional() })),
        async (c) => {
          const { spaceId } = c.req.valid('query');
          const rows = db
            .select()
            .from(people)
            .where(
              and(
                notDeleted(people),
                eq(people.listed, true),
                spaceId ? eq(people.spaceId, spaceId) : undefined,
              ),
            )
            .all();
          const data = cardData(db, OrgIndex.load(db), rows);
          const photoIds = rows.map((r) => r.photoFileId).filter((id): id is string => !!id);
          const paths = new Map(
            (photoIds.length
              ? db.select().from(files).where(inArray(files.id, photoIds)).all()
              : []
            ).map((f) => [f.id, f.path]),
          );
          const cards: string[] = [];
          for (const person of rows) {
            const path = person.photoFileId ? paths.get(person.photoFileId) : undefined;
            const photo = path
              ? await readFile(join(config.dataDir, 'files', path)).catch(() => undefined)
              : undefined;
            cards.push(
              buildVcard(data.get(person.id)!, {
                photo,
                link: { url: `${config.publicUrl.origin}/people/${person.id}`, label: APP_NAME },
              }),
            );
          }
          return c.body(cards.join(''), 200, {
            'content-type': 'text/vcard; charset=utf-8',
            'content-disposition': attachment(`personengedaechtnis-kontakte-${stamp()}.vcf`),
          });
        },
      )
      .get('/import/status', (c) => c.json({ empty: isEmpty(db) }))
      .post(
        '/import',
        bodyLimit({
          maxSize: 1024 * 1024 * 1024,
          onError: (c) => c.json({ error: 'file_too_large' }, 413),
        }),
        async (c) => {
          let body: unknown;
          try {
            body = await c.req.json();
          } catch {
            throw new DomainError(400, 'invalid_export');
          }
          return c.json({ imported: await importAll(db, config.dataDir, body) });
        },
      )
  );
}
