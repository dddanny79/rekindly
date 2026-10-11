import { Hono } from 'hono';
import { createSpaceRequestSchema, updateSpaceRequestSchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { createSpace, deleteSpace, listSpaces, updateSpace } from './service';

export function spaceRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json({ spaces: listSpaces(db) }))
    .post('/', validate('json', createSpaceRequestSchema), (c) =>
      c.json(createSpace(db, c.req.valid('json')), 201),
    )
    .patch('/:id', validate('json', updateSpaceRequestSchema), (c) =>
      c.json(updateSpace(db, c.req.param('id'), c.req.valid('json'))),
    )
    .delete('/:id', (c) => {
      deleteSpace(db, c.req.param('id'));
      return c.body(null, 204);
    });
}
