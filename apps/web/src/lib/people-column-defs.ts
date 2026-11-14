import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FieldDefinition, PersonListItem } from '@app/shared';
import { fieldDefinitionsQuery } from '@/lib/data';
import { formatBirthday, formatPartialDate } from '@/lib/dates';
import { webDisplay } from '@/lib/format';
import { spaceName } from '@/lib/labels';
import {
  BUILT_IN_COLUMNS,
  fieldColumn,
  type PeopleColumn,
  usePeopleColumns,
} from '@/lib/people-columns';
import { useSelectedSpace } from '@/lib/space-selection';

export interface ColumnDef {
  id: PeopleColumn;
  label: string;
  /** Dates: right-aligned with tabular numbers. */
  numeric?: boolean;
  value: (person: PersonListItem) => string | null;
}

/**
 * All columns the people list can show, with their values. `chosen` are the columns
 * currently shown: “Role · Organization” falls back to “Who is this?” (as before columns
 * could be chosen) unless that has its own column.
 */
export function useColumnDefs(chosen: readonly PeopleColumn[]): ColumnDef[] {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const { data: definitions = [] } = useQuery(fieldDefinitionsQuery('person'));
  const { spaces } = useSelectedSpace();

  return useMemo(() => {
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    const formatDate = (iso: string | null | undefined) =>
      iso ? date.format(new Date(iso)) : null;
    const ownSummary = chosen.includes('summary');

    const values: Record<(typeof BUILT_IN_COLUMNS)[number], Omit<ColumnDef, 'id' | 'label'>> = {
      role: {
        value: (p) =>
          p.role && p.organization
            ? `${p.role} @ ${p.organization.name}`
            : (p.organization?.name ?? p.role ?? (ownSummary ? null : p.summary)),
      },
      tags: { value: (p) => p.tags.map((tag) => `#${tag.name}`).join(' ') || null },
      lastContact: { numeric: true, value: (p) => formatDate(p.lastContactAt) },
      updated: { numeric: true, value: (p) => formatDate(p.updatedAt) },
      summary: { value: (p) => p.summary },
      nickname: { value: (p) => p.nickname ?? null },
      pronouns: { value: (p) => p.pronouns ?? null },
      birthday: { value: (p) => (p.birthday ? formatBirthday(p.birthday, locale) : null) },
      email: { value: (p) => p.email ?? null },
      phone: { value: (p) => p.phone ?? null },
      city: { value: (p) => p.city ?? null },
      met: {
        value: (p) =>
          [
            p.metWhere,
            p.metWhen && formatPartialDate(p.metWhen, locale),
            p.metThrough && t('people.columns.metThrough', { name: p.metThrough }),
          ]
            .filter(Boolean)
            .join(' · ') || null,
      },
      space: {
        value: (p) => {
          const space = spaces.find((s) => s.id === p.spaceId);
          return space ? spaceName(t, space) : null;
        },
      },
      contactRhythm: {
        value: (p) =>
          p.contactEveryDays ? t('people.columns.rhythm', { count: p.contactEveryDays }) : null,
      },
      createdAt: { numeric: true, value: (p) => formatDate(p.createdAt) },
    };

    const builtIn: ColumnDef[] = BUILT_IN_COLUMNS.map((id) => ({
      id,
      label: t(`people.columns.${id}`),
      ...values[id],
    }));
    const custom: ColumnDef[] = definitions.map((definition) => ({
      id: fieldColumn(definition.id),
      label: definition.label,
      value: (p) => {
        const raw = p.fields?.[definition.id];
        return raw
          ? formatFieldValue(definition, raw, locale, t('common.yes'), t('common.no'))
          : null;
      },
    }));
    return [...builtIn, ...custom];
  }, [chosen, definitions, spaces, locale, t]);
}

function formatFieldValue(
  definition: FieldDefinition,
  value: string,
  locale: string,
  yes: string,
  no: string,
): string {
  switch (definition.type) {
    case 'date':
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(`${value}T00:00:00Z`),
      );
    case 'boolean':
      return value === 'true' ? yes : no;
    case 'url':
      return webDisplay(value);
    default:
      return value;
  }
}

/**
 * The columns to show, in the chosen order: known ones only (a deleted custom field
 * disappears), and the space only while all spaces are shown.
 */
export function useVisibleColumns() {
  const chosen = usePeopleColumns();
  const defs = useColumnDefs(chosen);
  const { spaceId } = useSelectedSpace();
  const byId = new Map(defs.map((def) => [def.id, def]));
  const visible = chosen.flatMap((id) => {
    const def = byId.get(id);
    return def && !(id === 'space' && spaceId) ? [def] : [];
  });
  return { chosen, visible };
}
