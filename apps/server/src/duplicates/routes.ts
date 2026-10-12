import { Hono } from 'hono';
import { dismissDuplicateRequestSchema, mergePeopleRequestSchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { dismissDuplicate, findDuplicates, mergePeople } from './service';

export function duplicateRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json({ pairs: findDuplicates(db) }))
    .post('/dismiss', validate('json', dismissDuplicateRequestSchema), (c) => {
      dismissDuplicate(db, c.req.valid('json').personIds);
      return c.body(null, 204);
    })
    .post('/merge', validate('json', mergePeopleRequestSchema), (c) => {
      const { keepId, mergeId, take } = c.req.valid('json');
      return c.json(mergePeople(db, keepId, mergeId, take));
    });
}
