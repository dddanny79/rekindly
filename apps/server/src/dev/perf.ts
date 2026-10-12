/**
 * Search performance check with invented data (task 04: < 100 ms for 5,000 people
 * and 50,000 entries). Runs against a temporary database and prints a Markdown table.
 *
 *   pnpm --filter @app/server perf [-- --people 5000 --entries 50000 --runs 50]
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config';
import { createDb, runMigrations } from '../db/client';
import { seed } from '../db/seed';
import { flushSearchQueue, search } from '../search/service';
import { insertSampleData } from './sample-data';

const { values } = parseArgs({
  // pnpm passes the `--` separator through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    people: { type: 'string', default: '5000' },
    entries: { type: 'string', default: '50000' },
    runs: { type: 'string', default: '50' },
  },
});
const people = Number(values.people);
const entryCount = Number(values.entries);
const runs = Number(values.runs);

const dir = mkdtempSync(join(tmpdir(), 'app-perf-'));
const { db, sqlite } = createDb(dir);
const time = (fn: () => void) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

try {
  runMigrations(db, loadConfig().migrationsDir);
  seed(db);
  const insertMs = time(() => insertSampleData(db, { people, entries: entryCount }));
  const indexMs = time(() => flushSearchQueue(db));
  const spaceId = (
    sqlite.prepare('select id from spaces order by sort limit 1').get() as { id: string }
  ).id;
  const somePerson = sqlite.prepare('select id from people limit 1 offset 100').get() as {
    id: string;
  };

  const cases: [string, Parameters<typeof search>[1]][] = [
    ['name, umlaut variant: "mueller"', { q: 'mueller' }],
    ['three fields: "mueller köln einkauf"', { q: 'mueller köln einkauf' }],
    ['word only in notes: "segeltörn"', { q: 'segeltörn' }],
    ['frequent 2-char prefix: "an"', { q: 'an' }],
    ['frequent prefix in notes: "ang"', { q: 'ang' }],
    ['phone digits: "4915"', { q: '4915' }],
    ['with space filter: "schmidt"', { q: 'schmidt', spaceId }],
    ['palette size (limit 8): "ju"', { q: 'ju', limit: 8 }],
    ['no hit: "xylophon"', { q: 'xylophon' }],
  ];

  const rows: string[] = [];
  for (const [label, query] of cases) {
    search(db, query); // warm up
    const samples = Array.from({ length: runs }, () => time(() => search(db, query))).sort(
      (a, b) => a - b,
    );
    const p = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))]!;
    const hits = search(db, query).results.length;
    rows.push(
      `| ${label} | ${hits} | ${p(0.5).toFixed(1)} | ${p(0.95).toFixed(1)} | ${samples.at(-1)!.toFixed(1)} |`,
    );
  }

  // A write re-indexes one document before the next search.
  const writeThenSearch = Array.from({ length: runs }, (_, i) =>
    time(() => {
      sqlite
        .prepare('update people set summary = ? where id = ?')
        .run(`Geändert ${i}`, somePerson.id);
      search(db, { q: 'mueller' });
    }),
  ).sort((a, b) => a - b);

  const size = (
    sqlite
      .prepare('select page_count * page_size as n from pragma_page_count(), pragma_page_size()')
      .get() as { n: number }
  ).n;
  console.log(
    `\n${people} people, ${entryCount} entries — Node ${process.version}, ${runs} runs per query\n`,
  );
  console.log(
    `Insert sample data: ${(insertMs / 1000).toFixed(1)} s · build search index: ${(indexMs / 1000).toFixed(1)} s · database: ${(size / 1024 / 1024).toFixed(0)} MB\n`,
  );
  console.log('| Query | Hits (max 20) | Median ms | p95 ms | Max ms |');
  console.log('| --- | ---: | ---: | ---: | ---: |');
  console.log(rows.join('\n'));
  console.log(
    `| edit one person, then search | – | ${writeThenSearch[Math.floor(runs / 2)]!.toFixed(1)} | ${writeThenSearch[Math.floor(runs * 0.95)]!.toFixed(1)} | ${writeThenSearch.at(-1)!.toFixed(1)} |`,
  );
} finally {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
}
