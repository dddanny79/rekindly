import { eq } from 'drizzle-orm';
import type { InstanceSettings, UpdateInstanceSettingsRequest } from '@app/shared';
import type { Db } from '../db/client';
import { settings } from '../db/schema';

/** Storage key and default per instance setting. */
const DEFINITIONS = {
  passkeysEnabled: { key: 'auth.passkeysEnabled', default: false },
} as const satisfies Record<keyof InstanceSettings, { key: string; default: unknown }>;

export function getInstanceSettings(db: Db): InstanceSettings {
  const rows = new Map(
    db
      .select()
      .from(settings)
      .all()
      .map((row) => [row.key, row.value]),
  );
  const read = <K extends keyof InstanceSettings>(name: K): InstanceSettings[K] => {
    const { key, default: fallback } = DEFINITIONS[name];
    return (rows.has(key) ? rows.get(key) : fallback) as InstanceSettings[K];
  };
  return { passkeysEnabled: read('passkeysEnabled') };
}

export function updateInstanceSettings(
  db: Db,
  patch: UpdateInstanceSettingsRequest,
): InstanceSettings {
  db.transaction((tx) => {
    for (const [name, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const { key } = DEFINITIONS[name as keyof InstanceSettings];
      tx.insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
        .run();
    }
  });
  return getInstanceSettings(db);
}

export const passkeysEnabled = (db: Db) =>
  db.select().from(settings).where(eq(settings.key, DEFINITIONS.passkeysEnabled.key)).get()
    ?.value === true;
