import { isNull, sql, type Column } from 'drizzle-orm';

export const notDeleted = (table: { deletedAt: Column }) => isNull(table.deletedAt);

/** `fold(column) LIKE %fold(query)%` with LIKE wildcards in the query escaped. */
export function foldedContains(expression: ReturnType<typeof sql>, query: string) {
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  return sql`fold(${expression}) like '%' || fold(${escaped}) || '%' escape '\\'`;
}

export const nowIso = () => new Date().toISOString();
