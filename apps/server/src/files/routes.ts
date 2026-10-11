import { Hono } from 'hono';
import type { AppEnv, Deps } from '../env';
import { notFound } from '../lib/errors';
import { readStoredFile } from './service';

export function fileRoutes({ db, config }: Deps) {
  return new Hono<AppEnv>().get('/:id', async (c) => {
    const file = await readStoredFile(db, config.dataDir, c.req.param('id'));
    if (!file) throw notFound();
    return c.body(new Uint8Array(file.data), 200, {
      'content-type': file.row.mime,
      // File ids change whenever the content changes.
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
  });
}
