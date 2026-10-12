import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ZodType } from 'zod';
import {
  contactImportOptionsSchema,
  contactImportPreviewOptionsSchema,
  monicaFetchRequestSchema,
} from '@app/shared';
import { getAccountRow } from '../auth/account';
import type { AppEnv, Deps } from '../env';
import { DomainError } from '../lib/errors';
import { validate } from '../lib/validate';
import { fetchMonica, MONICA_API_FORMAT } from './monica-api';
import { listImports, previewImport, runImport, undoImport, type ImportFile } from './service';

const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

const limit = bodyLimit({
  maxSize: MAX_IMPORT_BYTES,
  onError: (c) => c.json({ error: 'file_too_large' }, 413),
});

/** Multipart upload: `file` and `options` (JSON). */
async function readUpload<T>(
  c: Context<AppEnv>,
  schema: ZodType<T>,
): Promise<{ file: ImportFile; options: T }> {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) throw new DomainError(400, 'file_required');
  let options: unknown = {};
  try {
    if (typeof body.options === 'string' && body.options) options = JSON.parse(body.options);
  } catch {
    throw new DomainError(400, 'validation_failed');
  }
  const parsed = schema.safeParse(options);
  if (!parsed.success) throw new DomainError(400, 'validation_failed');
  return {
    file: { name: file.name || null, data: Buffer.from(await file.arrayBuffer()) },
    options: parsed.data,
  };
}

export function contactImportRoutes({ db, config }: Deps) {
  const locale = () => (getAccountRow(db)?.locale === 'de' ? 'de' : 'en') as 'de' | 'en';
  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(listImports(db)))
      .post('/preview', limit, async (c) => {
        const { file, options } = await readUpload(c, contactImportPreviewOptionsSchema);
        return c.json(previewImport(db, file, locale(), options.mapping));
      })
      .post('/', limit, async (c) => {
        const { file, options } = await readUpload(c, contactImportOptionsSchema);
        return c.json(await runImport(db, config.dataDir, file, options, locale()), 201);
      })
      // Reads a Monica account through its API; the answer is a file for preview and import.
      .post('/monica-fetch', validate('json', monicaFetchRequestSchema), async (c) => {
        const { url, token } = c.req.valid('json');
        const data = await fetchMonica({ url, token });
        return c.json({
          format: MONICA_API_FORMAT,
          version: 1,
          url: new URL(url).origin,
          fetchedAt: new Date().toISOString(),
          data,
        });
      })
      .post('/:id/undo', (c) => c.json(undoImport(db, c.req.param('id'))))
  );
}
