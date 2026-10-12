import { Hono } from 'hono';
import { remindersQuerySchema, updateReminderRequestSchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { deleteReminder, listReminders, updateReminder } from './service';

export function reminderRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get('/', validate('query', remindersQuerySchema), (c) =>
      c.json({ reminders: listReminders(db, c.req.valid('query')) }),
    )
    .patch('/:id', validate('json', updateReminderRequestSchema), (c) =>
      c.json(updateReminder(db, c.req.param('id'), c.req.valid('json'))),
    )
    .delete('/:id', (c) => {
      deleteReminder(db, c.req.param('id'));
      return c.body(null, 204);
    });
}
