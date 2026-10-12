import { Hono } from 'hono';
import {
  createEntryRequestSchema,
  entriesQuerySchema,
  updateEntryRequestSchema,
} from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { createEntry, deleteEntry, getEntry, listEntries, updateEntry } from './service';

export function entryRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get('/', validate('query', entriesQuerySchema), (c) =>
      c.json({ entries: listEntries(db, c.req.valid('query')) }),
    )
    .post('/', validate('json', createEntryRequestSchema), (c) =>
      c.json(createEntry(db, c.req.valid('json')), 201),
    )
    .get('/:id', (c) => c.json(getEntry(db, c.req.param('id'))))
    .patch('/:id', validate('json', updateEntryRequestSchema), (c) =>
      c.json(updateEntry(db, c.req.param('id'), c.req.valid('json'))),
    )
    .delete('/:id', (c) => {
      deleteEntry(db, c.req.param('id'));
      return c.body(null, 204);
    });
}
