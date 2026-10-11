import { Hono } from 'hono';
import { updateInstanceSettingsRequestSchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { getInstanceSettings, updateInstanceSettings } from './service';

export function settingsRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json(getInstanceSettings(deps.db)))
    .patch('/', validate('json', updateInstanceSettingsRequestSchema), (c) =>
      c.json(updateInstanceSettings(deps.db, c.req.valid('json'))),
    );
}
