import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { relationshipTypes, settings, spaces } from './schema';

const SEED_VERSION_KEY = 'seed.version';
const SEED_VERSION = 1;

/**
 * Inserts the default data once per database. Names are i18n keys that the web app
 * translates; a user can later rename them, which sets `name`.
 */
export function seed(db: Db) {
  db.transaction((tx) => {
    const done = tx.select().from(settings).where(eq(settings.key, SEED_VERSION_KEY)).get();
    if (done && Number(done.value) >= SEED_VERSION) return;

    tx.insert(spaces)
      .values([
        { nameKey: 'seed.spaces.private', color: 'olive', sort: 0 },
        { nameKey: 'seed.spaces.business', color: 'navy', sort: 1 },
      ])
      .run();

    const symmetric = (key: string, sort: number) => ({
      nameKey: `seed.relationshipTypes.${key}`,
      reverseNameKey: `seed.relationshipTypes.${key}`,
      symmetric: true,
      sort,
    });
    const directed = (key: string, reverseKey: string, sort: number) => ({
      nameKey: `seed.relationshipTypes.${key}`,
      reverseNameKey: `seed.relationshipTypes.${reverseKey}`,
      symmetric: false,
      sort,
    });
    tx.insert(relationshipTypes)
      .values([
        symmetric('partner', 0),
        directed('parent', 'child', 1),
        symmetric('sibling', 2),
        symmetric('friend', 3),
        symmetric('colleague', 4),
        directed('manager', 'report', 5),
      ])
      .run();

    tx.insert(settings)
      .values({ key: SEED_VERSION_KEY, value: SEED_VERSION })
      .onConflictDoUpdate({ target: settings.key, set: { value: SEED_VERSION } })
      .run();
  });
}
