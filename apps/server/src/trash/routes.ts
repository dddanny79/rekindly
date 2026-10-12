import { Hono } from 'hono';
import { trashKindSchema } from '@app/shared';
import { z } from 'zod';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { listTrash, purgeItem, purgeTrash, restoreItem } from './service';

const itemParams = z.object({ kind: trashKindSchema, id: z.string().min(1) });

export function trashRoutes({ db, config }: Deps) {
  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json({ items: listTrash(db) }))
      // Empty the trash: everything in it is deleted for good.
      .delete('/', async (c) => c.json(await purgeTrash(db, config.dataDir)))
      .post('/:kind/:id/restore', validate('param', itemParams), (c) => {
        const { kind, id } = c.req.valid('param');
        restoreItem(db, kind, id);
        return c.body(null, 204);
      })
      .delete('/:kind/:id', validate('param', itemParams), async (c) => {
        const { kind, id } = c.req.valid('param');
        await purgeItem(db, config.dataDir, kind, id);
        return c.body(null, 204);
      })
  );
}
