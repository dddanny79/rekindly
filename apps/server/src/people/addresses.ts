import { and, asc, eq } from 'drizzle-orm';
import type { Address } from '@app/shared';
import type { Db } from '../db/client';
import { addresses } from '../db/schema';
import { notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';

export type AddressOwner = { personId: string } | { organizationId: string };
type AddressInput = Partial<Omit<Address, 'id'>>;

const ownerWhere = (owner: AddressOwner) =>
  'personId' in owner
    ? eq(addresses.personId, owner.personId)
    : eq(addresses.organizationId, owner.organizationId);

const toAddress = (row: typeof addresses.$inferSelect): Address => ({
  id: row.id,
  label: row.label,
  street: row.street,
  zip: row.zip,
  city: row.city,
  region: row.region,
  country: row.country,
});

export function listAddresses(db: Db, owner: AddressOwner): Address[] {
  return db
    .select()
    .from(addresses)
    .where(and(ownerWhere(owner), notDeleted(addresses)))
    .orderBy(asc(addresses.sort), asc(addresses.createdAt))
    .all()
    .map(toAddress);
}

export function addAddress(db: Db, owner: AddressOwner, input: AddressInput): Address {
  return toAddress(
    db
      .insert(addresses)
      .values({ ...owner, ...input })
      .returning()
      .get(),
  );
}

export function updateAddress(
  db: Db,
  owner: AddressOwner,
  id: string,
  input: AddressInput,
): Address {
  const row = db
    .update(addresses)
    .set(input)
    .where(and(eq(addresses.id, id), ownerWhere(owner), notDeleted(addresses)))
    .returning()
    .get();
  if (!row) throw notFound();
  return toAddress(row);
}

export function deleteAddress(db: Db, owner: AddressOwner, id: string) {
  const res = db
    .update(addresses)
    .set({ deletedAt: nowIso() })
    .where(and(eq(addresses.id, id), ownerWhere(owner), notDeleted(addresses)))
    .run();
  if (res.changes === 0) throw notFound();
}
