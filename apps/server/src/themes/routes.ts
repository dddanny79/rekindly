import { Hono } from 'hono';
import { saveThemeRequestSchema, themeDefaultsRequestSchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import {
  createTheme,
  deleteTheme,
  getTheme,
  listThemes,
  restoreTheme,
  setThemeDefaults,
  updateTheme,
} from './service';

export function themeRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json(listThemes(db)))
    .put('/defaults', validate('json', themeDefaultsRequestSchema), (c) =>
      c.json(setThemeDefaults(db, c.req.valid('json'))),
    )
    .post('/', validate('json', saveThemeRequestSchema), (c) =>
      c.json(createTheme(db, c.req.valid('json').theme), 201),
    )
    .get('/:id', (c) => c.json(getTheme(db, c.req.param('id'))))
    .put('/:id', validate('json', saveThemeRequestSchema), (c) =>
      c.json(updateTheme(db, c.req.param('id'), c.req.valid('json').theme)),
    )
    .delete('/:id', (c) => {
      deleteTheme(db, c.req.param('id'));
      return c.body(null, 204);
    })
    .post('/:id/restore', (c) => c.json(restoreTheme(db, c.req.param('id'))));
}
