import { Hono } from 'hono';
import { searchQuerySchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { search } from './service';

export function searchRoutes({ db }: Deps) {
  return new Hono<AppEnv>().get('/', validate('query', searchQuerySchema), (c) =>
    c.json(search(db, c.req.valid('query'))),
  );
}
