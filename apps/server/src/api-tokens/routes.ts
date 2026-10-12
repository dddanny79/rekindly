import { Hono } from 'hono';
import { createApiTokenRequestSchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { createApiToken, deleteApiToken, listApiTokens } from './service';

export function apiTokenRoutes({ db, config }: Deps) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json({ apiTokens: listApiTokens(db) }))
    .post('/', validate('json', createApiTokenRequestSchema), (c) => {
      const created = createApiToken(db, c.req.valid('json'));
      return c.json({ ...created, mcpUrl: new URL('/mcp', config.publicUrl).toString() }, 201);
    })
    .delete('/:id', (c) => {
      deleteApiToken(db, c.req.param('id'));
      return c.body(null, 204);
    });
}
