import type { TFunction } from 'i18next';
import type { LabelRef, Space, SpaceColor } from '@app/shared';

/** Seeded rows are translated via their key; user-created ones use their name. */
export function labelText(t: TFunction, ref: LabelRef): string {
  if (ref.name) return ref.name;
  // Keys come from the server's seed; unknown ones fall back to the key itself.
  return ref.nameKey ? String(t(ref.nameKey as never)) : '';
}

export const spaceName = (t: TFunction, space: Pick<Space, 'name' | 'nameKey'>) =>
  labelText(t, space);

/** CSS colour of a space (palette key → token that adapts to light/dark). */
export const spaceColor = (color: SpaceColor | null | undefined) =>
  `var(--space-${color ?? 'slate'})`;

/** “Child of Jana Berger” for an indirect contact. */
export const relatedToText = (
  t: TFunction,
  relatedTo: { label: LabelRef; person: { displayName: string } },
) =>
  t('indirect.relatedToPlain', {
    label: labelText(t, relatedTo.label),
    name: relatedTo.person.displayName,
  });
