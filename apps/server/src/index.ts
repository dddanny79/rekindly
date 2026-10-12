import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { APP_NAME } from '@app/shared';
import { createApp } from './app';
import { deleteExpiredSessions } from './auth/sessions';
import { ConfigError, loadConfig, type ServerConfig } from './config';
import { createDb, runMigrations } from './db/client';
import { seed } from './db/seed';
import { createDeps } from './deps';
import { log, setLogLevel } from './lib/log';
import { flushSearchQueue } from './search/service';
import { schedulePurge } from './trash/service';
import { APP_VERSION } from './version';

/** Stops with a readable message instead of a stack trace for setup mistakes. */
function fail(message: string): never {
  console.error(`${APP_NAME} cannot start.\n${message}`);
  process.exit(1);
}

let config: ServerConfig;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof ConfigError) fail(error.message);
  throw error;
}
setLogLevel(config.logLevel);

let handle: ReturnType<typeof createDb>;
try {
  handle = createDb(config.dataDir);
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    fail(
      `The data directory ${config.dataDir} is not writable (${code}). ` +
        'In Docker, the volume must belong to the user the app runs as (uid 1000).',
    );
  }
  throw error;
}
const { db, sqlite } = handle;
runMigrations(db, config.migrationsDir);
seed(db);
deleteExpiredSessions(db);
// Index whatever is still queued (e.g. everything after the index migration).
flushSearchQueue(db);
// Deleted data older than 30 days is purged at start and then daily.
const stopPurge = schedulePurge(db, config.dataDir);

const app = createApp({ deps: createDeps(db, config), webDistDir: config.webDistDir });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  log.info(`${APP_NAME} ${APP_VERSION} listening on http://${info.address}:${info.port}`);
  log.info(
    `Data directory: ${config.dataDir} · public URL: ${config.publicUrl.origin} · time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
  );
}) as Server;

function shutdown() {
  log.info('Shutting down …');
  stopPurge();
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
  // Idle keep-alive connections would otherwise delay the stop (docker stop).
  server.closeIdleConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
