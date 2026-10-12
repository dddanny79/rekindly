/**
 * Fills an empty database in DATA_DIR with the invented showcase data set (for
 * screenshots and the demo). Refuses a database that already has people.
 *
 *   pnpm --filter @app/server showcase-data
 */
import { loadConfig } from '../config';
import { createDb, runMigrations } from '../db/client';
import { seed } from '../db/seed';
import { flushSearchQueue } from '../search/service';
import { insertShowcase } from './showcase';

const config = loadConfig();
const { db, sqlite } = createDb(config.dataDir);
try {
  runMigrations(db, config.migrationsDir);
  seed(db);
  const { n } = sqlite.prepare('select count(*) as n from people').get() as { n: number };
  if (n > 0) {
    console.error(
      `${config.dataDir} already contains ${n} people; the showcase needs an empty one.`,
    );
    process.exitCode = 1;
  } else {
    insertShowcase(db);
    flushSearchQueue(db);
    console.log(`Added the invented showcase data to ${config.dataDir}.`);
  }
} finally {
  sqlite.close();
}
