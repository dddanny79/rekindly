import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  createOrganizationRequestSchema,
  Organization,
  OrganizationListItem,
  OrganizationMember,
  organizationsQuerySchema,
  updateOrganizationRequestSchema,
} from '@app/shared';
import type { Db } from '../db/client';
import { affiliations, organizations, people } from '../db/schema';
import { fieldValuesFor } from '../catalog/fields';
import { DomainError, notFound } from '../lib/errors';
import { foldedContains, notDeleted, nowIso } from '../lib/sql';
import { listAddresses } from '../people/addresses';
import { toPersonRef } from '../people/refs';
import { getLiveSpace } from '../spaces/service';
import { OrgIndex } from '.';

type In<T extends z.ZodType> = z.output<T>;

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

function getLiveOrganization(db: Db, id: string) {
  const row = db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, id), notDeleted(organizations)))
    .get();
  if (!row) throw notFound();
  return row;
}

export function listOrganizations(
  db: Db,
  query: In<typeof organizationsQuerySchema>,
): OrganizationListItem[] {
  const conditions = [notDeleted(organizations)];
  if (query.spaceId) conditions.push(eq(organizations.spaceId, query.spaceId));
  if (query.q) conditions.push(foldedContains(sql`${organizations.name}`, query.q));

  const counts = new Map(
    db
      .select({ orgId: affiliations.organizationId, n: count() })
      .from(affiliations)
      .innerJoin(people, eq(people.id, affiliations.personId))
      .where(and(notDeleted(affiliations), isNull(affiliations.endedOn), notDeleted(people)))
      .groupBy(affiliations.organizationId)
      .all()
      .map((row) => [row.orgId, row.n]),
  );

  return db
    .select()
    .from(organizations)
    .where(and(...conditions))
    .all()
    .sort((a, b) => collator.compare(a.name, b.name))
    .map((row) => ({
      id: row.id,
      spaceId: row.spaceId,
      parentId: row.parentId,
      name: row.name,
      kind: row.kind,
      peopleCount: counts.get(row.id) ?? 0,
    }));
}

export function getOrganization(db: Db, id: string): Organization {
  const org = getLiveOrganization(db, id);
  const index = OrgIndex.load(db);

  const children = [...index.byId.values()]
    .filter((node) => node.parentId === id)
    .sort((a, b) => collator.compare(a.name, b.name))
    .map(({ id, name, kind }) => ({ id, name, kind }));

  const members = db
    .select({ affiliation: affiliations, person: people })
    .from(affiliations)
    .innerJoin(people, eq(people.id, affiliations.personId))
    .where(and(eq(affiliations.organizationId, id), notDeleted(affiliations), notDeleted(people)))
    .orderBy(asc(affiliations.createdAt))
    .all()
    .map(({ affiliation, person }): OrganizationMember => ({
      affiliationId: affiliation.id,
      role: affiliation.role,
      startedOn: affiliation.startedOn,
      endedOn: affiliation.endedOn,
      person: toPersonRef(person),
    }))
    .sort((a, b) => collator.compare(a.person.displayName, b.person.displayName));

  return {
    id: org.id,
    spaceId: org.spaceId,
    parentId: org.parentId,
    name: org.name,
    kind: org.kind,
    website: org.website,
    notes: org.notes,
    path: index.path(id),
    children,
    currentMembers: members.filter((m) => !m.endedOn),
    formerMembers: members.filter((m) => m.endedOn),
    addresses: listAddresses(db, { organizationId: id }),
    fields: fieldValuesFor(db, [id]).get(id) ?? [],
  };
}

/** The parent must be live, in the same space, and not the organization or below it. */
function checkParent(db: Db, orgId: string | null, spaceId: string, parentId: string) {
  const index = OrgIndex.load(db);
  const parent = index.byId.get(parentId);
  if (!parent) throw new DomainError(400, 'unknown_organization');
  if (parent.spaceId !== spaceId) throw new DomainError(400, 'space_mismatch');
  if (orgId && index.subtree(orgId).includes(parentId)) {
    throw new DomainError(409, 'organization_cycle');
  }
}

export function createOrganization(
  db: Db,
  input: In<typeof createOrganizationRequestSchema>,
): Organization {
  getLiveSpace(db, input.spaceId);
  if (input.parentId) checkParent(db, null, input.spaceId, input.parentId);
  const row = db
    .insert(organizations)
    .values({
      spaceId: input.spaceId,
      name: input.name,
      kind: input.kind ?? null,
      parentId: input.parentId ?? null,
      website: input.website ?? null,
    })
    .returning()
    .get();
  return getOrganization(db, row.id);
}

export function updateOrganization(
  db: Db,
  id: string,
  input: In<typeof updateOrganizationRequestSchema>,
): Organization {
  const current = getLiveOrganization(db, id);
  if (input.parentId) checkParent(db, id, current.spaceId, input.parentId);
  db.update(organizations).set(input).where(eq(organizations.id, id)).run();
  return getOrganization(db, id);
}

/** Trash; sub-organizations stay and show up as top-level until it is restored. */
export function deleteOrganization(db: Db, id: string) {
  getLiveOrganization(db, id);
  db.update(organizations).set({ deletedAt: nowIso() }).where(eq(organizations.id, id)).run();
}

export { getLiveOrganization };
