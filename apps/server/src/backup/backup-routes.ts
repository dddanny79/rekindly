import { Hono } from 'hono';
import { backupConfigInputSchema, restoreBackupRequestSchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import {
  backupSettings,
  type BackupContext,
  listBackups,
  restoreFromTarget,
  runBackup,
  saveBackupSettings,
  testTarget,
} from './backups';

export function backupConfigRoutes({ db, config, secretKey }: Deps) {
  const ctx = (): BackupContext => ({ db, dataDir: config.dataDir, key: secretKey() });
  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(backupSettings(db)))
      .put('/', validate('json', backupConfigInputSchema), (c) =>
        c.json(saveBackupSettings(ctx(), c.req.valid('json'))),
      )
      .post('/test', async (c) => {
        await testTarget(ctx());
        return c.body(null, 204);
      })
      // Runs a backup now; the result (also a failure) comes back as status.
      .post('/run', async (c) => c.json(await runBackup(ctx())))
      .get('/files', async (c) => c.json({ files: await listBackups(ctx()) }))
      .post('/restore', validate('json', restoreBackupRequestSchema), async (c) => {
        const { name, passphrase } = c.req.valid('json');
        return c.json({ imported: await restoreFromTarget(ctx(), name, passphrase) });
      })
  );
}
