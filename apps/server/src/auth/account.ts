import { eq } from 'drizzle-orm';
import type { Account, SetupRequest } from '@app/shared';
import type { Db } from '../db/client';
import { account } from '../db/schema';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password';

const ACCOUNT_ID = 1;

export function getAccountRow(db: Db) {
  return db.select().from(account).where(eq(account.id, ACCOUNT_ID)).get() ?? null;
}

export function hasAccount(db: Db): boolean {
  return getAccountRow(db) !== null;
}

export function toAccount(row: NonNullable<ReturnType<typeof getAccountRow>>): Account {
  return { name: row.name, email: row.email, locale: row.locale === 'de' ? 'de' : 'en' };
}

export class AccountExistsError extends Error {}

/** Creates the single account. Fails if it already exists (setup is one-time). */
export async function createAccount(db: Db, input: SetupRequest): Promise<Account> {
  const passwordHash = await hashPassword(input.password);
  const inserted = db
    .insert(account)
    .values({
      id: ACCOUNT_ID,
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      locale: input.locale,
    })
    .onConflictDoNothing()
    .returning()
    .get();
  if (!inserted) throw new AccountExistsError();
  return toAccount(inserted);
}

/** Checks email and password; constant work whether or not the email matches. */
export async function verifyCredentials(db: Db, email: string, password: string) {
  const row = getAccountRow(db);
  if (!row || row.email !== email.trim().toLowerCase()) {
    await burnPasswordCheck(password);
    return false;
  }
  return verifyPassword(row.passwordHash, password);
}

export async function setPassword(db: Db, password: string) {
  const passwordHash = await hashPassword(password);
  db.update(account).set({ passwordHash }).where(eq(account.id, ACCOUNT_ID)).run();
}
