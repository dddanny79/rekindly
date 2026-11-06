import { Hono } from 'hono';
import { todayQuerySchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { dismissSyncDeletions, getToday } from './service';

export function todayRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get('/', validate('query', todayQuerySchema), (c) =>
      c.json(getToday(db, c.req.valid('query'))),
    )
    .post('/sync-deletions/dismiss', (c) => {
      dismissSyncDeletions(db);
      return c.body(null, 204);
    });
}
