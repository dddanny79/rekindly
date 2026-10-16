import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { passwordSchema, PASSWORD_MIN_LENGTH } from '@app/shared';
import { getAccountRow, setPassword } from './auth/account';
import { deleteAllSessions } from './auth/sessions';
import { setTwoFactor } from './auth/two-factor';
import { loadConfig } from './config';
import { backupsDir, createDb, MigrationError, runMigrations } from './db/client';
import { reindexAll } from './search/service';

const USAGE = `Usage: node dist/cli.js <command>

Commands:
  reset-password   Set a new password for the account and sign out all sessions.
                   Reads the password interactively, or from stdin when piped.
  disable-2fa      Switch off sign-in codes by email (e.g. when mail does not arrive).
  reindex          Rebuild the search index from scratch.
  backup [file]    Write a consistent copy of the database while the app runs.
                   Default: DATA_DIR/backups/app-<date>-<time>.sqlite. Back up
                   DATA_DIR/files (photos) as well.`;

/** Reads the first line of piped stdin. */
async function readPipedLine(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) data += String(chunk);
  return data.split(/\r?\n/)[0] ?? '';
}

/** Prompts for one line without echoing the typed characters. */
function promptHidden(prompt: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    muted = true;
    rl.once('line', (line) => {
      rl.close();
      process.stdout.write('\n');
      resolve(line);
    });
  });
}

const readSecret = (prompt: string) =>
  process.stdin.isTTY ? promptHidden(prompt) : readPipedLine();

async function resetPassword() {
  const config = loadConfig();
  const { db, sqlite } = createDb(config.dataDir);
  try {
    runMigrations(db, config.migrationsDir, { backupDir: backupsDir(config.dataDir) });
    const owner = getAccountRow(db);
    if (!owner) {
      console.error('No account exists yet. Open the app in a browser to run the setup.');
      return 1;
    }

    const password = await readSecret(`New password for ${owner.email}: `);
    if (!passwordSchema.safeParse(password).success) {
      console.error(`The password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
      return 1;
    }
    if (process.stdin.isTTY && (await readSecret('Repeat the new password: ')) !== password) {
      console.error('The passwords do not match.');
      return 1;
    }

    await setPassword(db, password);
    deleteAllSessions(db);
    console.log('Password changed. All sessions were signed out; passkeys still work.');
    return 0;
  } finally {
    sqlite.close();
  }
}

function disableTwoFactor() {
  const config = loadConfig();
  const { db, sqlite } = createDb(config.dataDir);
  try {
    runMigrations(db, config.migrationsDir, { backupDir: backupsDir(config.dataDir) });
    setTwoFactor(db, false);
    console.log('Sign-in codes by email are switched off; trusted devices were forgotten.');
    return 0;
  } finally {
    sqlite.close();
  }
}

function reindex() {
  const config = loadConfig();
  const { db, sqlite } = createDb(config.dataDir);
  try {
    runMigrations(db, config.migrationsDir, { backupDir: backupsDir(config.dataDir) });
    const started = performance.now();
    const counts = reindexAll(db);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(
      `Search index rebuilt: ${counts.people} people, ${counts.organizations} organizations (${seconds} s).`,
    );
    return 0;
  } finally {
    sqlite.close();
  }
}

async function backup(target?: string) {
  const config = loadConfig();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = resolve(target ?? join(backupsDir(config.dataDir), `app-${stamp}.sqlite`));
  if (existsSync(file)) {
    console.error(`${file} already exists; choose another file name.`);
    return 1;
  }
  mkdirSync(dirname(file), { recursive: true });
  const { sqlite } = createDb(config.dataDir);
  try {
    await sqlite.backup(file);
    console.log(`Database backed up to ${file}.`);
    return 0;
  } finally {
    sqlite.close();
  }
}

async function main(args: string[]) {
  switch (args[0]) {
    case 'reset-password':
      return resetPassword();
    case 'reindex':
      return reindex();
    case 'disable-2fa':
      return disableTwoFactor();
    case 'backup':
      return backup(args[1]);
    default:
      console.log(USAGE);
      return args[0] && args[0] !== '--help' ? 1 : 0;
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof MigrationError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
