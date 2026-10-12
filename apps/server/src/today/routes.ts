import { Hono } from 'hono';
import { todayQuerySchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { getToday } from './service';

export function todayRoutes({ db }: Deps) {
  return new Hono<AppEnv>().get('/', validate('query', todayQuerySchema), (c) =>
    c.json(getToday(db, c.req.valid('query'))),
  );
}
