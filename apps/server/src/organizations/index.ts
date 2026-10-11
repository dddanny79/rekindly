import { and, eq } from 'drizzle-orm';
import type { OrganizationRef } from '@app/shared';
import type { Db } from '../db/client';
import { organizations } from '../db/schema';
import { notDeleted } from '../lib/sql';

export interface OrgNode {
  id: string;
  spaceId: string;
  parentId: string | null;
  name: string;
  kind: string | null;
}

/** All live organizations by id; used to build paths and subtrees in memory. */
export class OrgIndex {
  private constructor(readonly byId: Map<string, OrgNode>) {}

  static load(db: Db, spaceId?: string): OrgIndex {
    const rows = db
      .select({
        id: organizations.id,
        spaceId: organizations.spaceId,
        parentId: organizations.parentId,
        name: organizations.name,
        kind: organizations.kind,
      })
      .from(organizations)
      .where(
        spaceId
          ? and(notDeleted(organizations), eq(organizations.spaceId, spaceId))
          : notDeleted(organizations),
      )
      .all();
    return new OrgIndex(new Map(rows.map((row) => [row.id, row])));
  }

  /** From the top-level organization down to `id`; stops at trashed parents. */
  path(id: string): { id: string; name: string }[] {
    const path: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    let node = this.byId.get(id);
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      path.unshift({ id: node.id, name: node.name });
      node = node.parentId ? this.byId.get(node.parentId) : undefined;
    }
    return path;
  }

  ref(id: string): OrganizationRef | null {
    const node = this.byId.get(id);
    return node ? { id: node.id, name: node.name, kind: node.kind, path: this.path(id) } : null;
  }

  /** `id` and all organizations below it. */
  subtree(id: string): string[] {
    const children = new Map<string, string[]>();
    for (const node of this.byId.values()) {
      if (!node.parentId) continue;
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
    }
    const result: string[] = [];
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      if (result.includes(current)) continue;
      result.push(current);
      stack.push(...(children.get(current) ?? []));
    }
    return result;
  }
}
