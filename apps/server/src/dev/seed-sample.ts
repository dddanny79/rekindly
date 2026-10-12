/**
 * Fills the database in DATA_DIR with invented sample data (for trying out search
 * with many records). Refuses to touch a database that already has people unless
 * `--force` is given — never run it against real data.
 *
 *   pnpm --filter @app/server sample-data [-- --people 5000 --entries 50000 --force]
 */
import { parseArgs } from 'node:util';
import { loadConfig } from '../config';
import { createDb, runMigrations } from '../db/client';
import { seed } from '../db/seed';
import { flushSearchQueue } from '../search/service';
import { insertSampleData } from './sample-data';

const { values } = parseArgs({
  // pnpm passes the `--` separator through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    people: { type: 'string', default: '500' },
    entries: { type: 'string', default: '5000' },
    force: { type: 'boolean', default: false },
  },
});

const config = loadConfig();
const { db, sqlite } = createDb(config.dataDir);
try {
  runMigrations(db, config.migrationsDir);
  seed(db);
  const { n } = sqlite.prepare('select count(*) as n from people').get() as { n: number };
  if (n > 0 && !values.force) {
    console.error(
      `${config.dataDir} already contains ${n} people. Use --force to add sample data anyway.`,
    );
    process.exitCode = 1;
  } else {
    insertSampleData(db, { people: Number(values.people), entries: Number(values.entries) });
    flushSearchQueue(db);
    console.log(
      `Added ${values.people} invented people and ${values.entries} entries to ${config.dataDir}.`,
    );
  }
} finally {
  sqlite.close();
}
