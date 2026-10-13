import { and, asc, eq, isNotNull, lt } from 'drizzle-orm';
import {
  BUILT_IN_THEME_IDS,
  BUILT_IN_THEMES,
  DEFAULT_LAYOUT_ID,
  DEFAULT_THEME_ID,
  LAYOUT_FROM_THEME,
  LAYOUT_TEMPLATES,
  themeSchema,
  type Theme,
  type ThemeDefaultsRequest,
  type ThemeListResponse,
  type ThemeRecord,
} from '@app/shared';
import type { Db } from '../db/client';
import { settings, themes } from '../db/schema';
import { DomainError, notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';

type ThemeRow = typeof themes.$inferSelect;

const KEYS = { theme: 'appearance.defaultTheme', layout: 'appearance.defaultLayout' } as const;

const builtIn = (): ThemeRecord[] =>
  BUILT_IN_THEME_IDS.map((id) => ({
    id,
    builtIn: true,
    theme: BUILT_IN_THEMES[id],
    createdAt: null,
    updatedAt: null,
  }));

const toRecord = (row: ThemeRow): ThemeRecord => ({
  id: row.id,
  builtIn: false,
  // Stored themes were validated on the way in; parse again so a file edited by hand
  // in the database cannot break the app.
  theme: themeSchema
    .catch({ format: 'rekindly-theme', version: 1, name: 'Invalid theme' })
    .parse(row.data) as Theme,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

function customThemes(db: Db) {
  return db.select().from(themes).where(notDeleted(themes)).orderBy(asc(themes.createdAt)).all();
}

const themeExists = (db: Db, id: string) =>
  !!BUILT_IN_THEMES[id] ||
  !!db
    .select({ id: themes.id })
    .from(themes)
    .where(and(eq(themes.id, id), notDeleted(themes)))
    .get();

const layoutExists = (id: string) =>
  id === LAYOUT_FROM_THEME || LAYOUT_TEMPLATES.some((t) => t.id === id);

function readSetting(db: Db, key: string) {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value as string | undefined;
}

function writeSetting(db: Db, key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/** The instance defaults; a deleted default theme falls back to the built-in one. */
export function themeDefaults(db: Db) {
  const theme = readSetting(db, KEYS.theme);
  const layout = readSetting(db, KEYS.layout);
  return {
    defaultThemeId: theme && themeExists(db, theme) ? theme : DEFAULT_THEME_ID,
    defaultLayoutId: layout && layoutExists(layout) ? layout : DEFAULT_LAYOUT_ID,
  };
}

export function listThemes(db: Db): ThemeListResponse {
  return {
    themes: [...builtIn(), ...customThemes(db).map(toRecord)],
    layouts: LAYOUT_TEMPLATES,
    ...themeDefaults(db),
  };
}

function customRow(db: Db, id: string) {
  const row = db
    .select()
    .from(themes)
    .where(and(eq(themes.id, id), notDeleted(themes)))
    .get();
  if (!row) throw BUILT_IN_THEMES[id] ? new DomainError(409, 'theme_built_in') : notFound();
  return row;
}

export function getTheme(db: Db, id: string): ThemeRecord {
  const builtInTheme = builtIn().find((t) => t.id === id);
  return builtInTheme ?? toRecord(customRow(db, id));
}

export function createTheme(db: Db, theme: Theme): ThemeRecord {
  return toRecord(db.insert(themes).values({ data: theme }).returning().get());
}

export function updateTheme(db: Db, id: string, theme: Theme): ThemeRecord {
  customRow(db, id);
  return toRecord(
    db.update(themes).set({ data: theme }).where(eq(themes.id, id)).returning().get(),
  );
}

/** Moves a theme to the trash; it can be restored for 30 days. */
export function deleteTheme(db: Db, id: string) {
  customRow(db, id);
  db.update(themes).set({ deletedAt: nowIso() }).where(eq(themes.id, id)).run();
}

export function restoreTheme(db: Db, id: string): ThemeRecord {
  const row = db
    .select()
    .from(themes)
    .where(and(eq(themes.id, id), isNotNull(themes.deletedAt)))
    .get();
  if (!row) throw notFound();
  return toRecord(
    db.update(themes).set({ deletedAt: null }).where(eq(themes.id, id)).returning().get(),
  );
}

export function setThemeDefaults(db: Db, input: ThemeDefaultsRequest) {
  if (input.defaultThemeId !== undefined) {
    if (!themeExists(db, input.defaultThemeId)) throw new DomainError(422, 'theme_unknown');
    writeSetting(db, KEYS.theme, input.defaultThemeId);
  }
  if (input.defaultLayoutId !== undefined) {
    if (!layoutExists(input.defaultLayoutId)) throw new DomainError(422, 'layout_unknown');
    writeSetting(db, KEYS.layout, input.defaultLayoutId);
  }
  return themeDefaults(db);
}

/** Deleted themes older than `before` go for good (daily trash purge). */
export function purgeDeletedThemes(db: Db, before: string) {
  return db
    .delete(themes)
    .where(and(isNotNull(themes.deletedAt), lt(themes.deletedAt, before)))
    .run().changes;
}
