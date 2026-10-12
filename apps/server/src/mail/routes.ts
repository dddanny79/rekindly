import { Hono } from 'hono';
import { mailSettingsInputSchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { mailSettings, saveMailSettings } from './config';
import { deliver, sendDigest, testMail, type MailContext } from './digest';

export function mailRoutes({ db, config, secretKey }: Deps) {
  const ctx = (): MailContext => ({
    db,
    key: secretKey(),
    env: config.mail,
    publicUrl: config.publicUrl,
  });
  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(mailSettings(db, config.mail)))
      .put('/', validate('json', mailSettingsInputSchema), (c) =>
        c.json(saveMailSettings(db, secretKey(), config.mail, c.req.valid('json'))),
      )
      .post('/test', async (c) => {
        await deliver(ctx(), testMail(db));
        return c.body(null, 204);
      })
      // Today's summary right now (also when it was already sent today).
      .post('/digest', async (c) => c.json({ sent: await sendDigest(ctx()) }))
  );
}
