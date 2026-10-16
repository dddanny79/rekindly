import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { APP_NAME } from '@app/shared';
import { createApp } from './app';
import { deleteExpiredSessions } from './auth/sessions';
import { ConfigError, loadConfig, type ServerConfig } from './config';
import { backupsDir, createDb, MigrationError, runMigrations } from './db/client';
import { seed } from './db/seed';
import { getAccountRow } from './auth/account';
import { adoptKeptDates } from './dav/inbound';
import { createDeps } from './deps';
import { log, setLogLevel } from './lib/log';
import { flushSearchQueue } from './search/service';
import { schedulePurge } from './trash/service';
import { scheduleBackups } from './backup/backups';
import { scheduleDigest } from './mail/digest';
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
try {
  const migrated = runMigrations(db, config.migrationsDir, {
    backupDir: backupsDir(config.dataDir),
  });
  if (migrated.backup) {
    log.info(
      `Database updated (${migrated.applied} migration${migrated.applied === 1 ? '' : 's'}); copy from before: ${migrated.backup}`,
    );
  }
} catch (error) {
  if (error instanceof MigrationError) fail(error.message);
  throw error;
}
seed(db);
// Dates that address books sent before 0.3 become recurring days (once).
adoptKeptDates(db, getAccountRow(db)?.locale === 'de' ? 'de' : 'en');
deleteExpiredSessions(db);
// Index whatever is still queued (e.g. everything after the index migration).
flushSearchQueue(db);
// Deleted data older than 30 days is purged at start and then daily.
const stopPurge = schedulePurge(db, config.dataDir);

const deps = createDeps(db, config);
// Nightly backups to the configured target (if any).
const stopBackups = scheduleBackups({ db, dataDir: config.dataDir, key: deps.secretKey() });
const stopDigest = scheduleDigest({
  db,
  key: deps.secretKey(),
  env: config.mail,
  publicUrl: config.publicUrl,
});

const app = createApp({ deps, webDistDir: config.webDistDir });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  const host = info.address.includes(':') ? `[${info.address}]` : info.address;
  log.info(`${APP_NAME} ${APP_VERSION} listening on http://${host}:${info.port}`);
  log.info(
    `Data directory: ${config.dataDir} · public URL: ${config.publicUrl.origin} · time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
  );
}) as Server;

function shutdown() {
  log.info('Shutting down …');
  stopPurge();
  stopBackups();
  stopDigest();
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
  // Idle keep-alive connections would otherwise delay the stop (docker stop).
  server.closeIdleConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
