import { serve } from '@hono/node-server';
import { APP_NAME } from '@app/shared';
import { createApp } from './app';
import { deleteExpiredSessions } from './auth/sessions';
import { loadConfig } from './config';
import { createDb, runMigrations } from './db/client';
import { seed } from './db/seed';
import { flushSearchQueue } from './search/service';
import { schedulePurge } from './trash/service';
import { createDeps } from './deps';
import { APP_VERSION } from './version';

const config = loadConfig();
const { db, sqlite } = createDb(config.dataDir);
runMigrations(db, config.migrationsDir);
seed(db);
deleteExpiredSessions(db);
// Index whatever is still queued (e.g. everything after the index migration).
flushSearchQueue(db);
// Deleted data older than 30 days is purged at start and then daily.
const stopPurge = schedulePurge(db, config.dataDir);

const app = createApp({ deps: createDeps(db, config), webDistDir: config.webDistDir });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`${APP_NAME} ${APP_VERSION} listening on http://${info.address}:${info.port}`);
  console.log(`Data directory: ${config.dataDir} · public URL: ${config.publicUrl.origin}`);
});

function shutdown() {
  stopPurge();
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
