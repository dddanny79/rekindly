import type { Address, ContactPoint } from '@app/shared';

export const ORGANIZATION_KINDS = [
  'company',
  'department',
  'site',
  'club',
  'school',
  'authority',
  'other',
] as const;

/** Link target for a contact point (tel:, mailto:, https://), or null. */
export function contactHref(point: Pick<ContactPoint, 'kind' | 'value'>): string | null {
  switch (point.kind) {
    case 'phone':
      return `tel:${point.value.replace(/[^\d+]/g, '')}`;
    case 'email':
      return `mailto:${point.value}`;
    case 'url':
    case 'social':
      return /^https?:\/\//i.test(point.value) ? point.value : `https://${point.value}`;
    default:
      return null;
  }
}

/** Address as display lines: street / zip city / region, country. */
export function formatAddress(a: Address): string[] {
  return [
    a.street,
    [a.zip, a.city].filter(Boolean).join(' '),
    [a.region, a.country].filter(Boolean).join(', '),
  ].filter((line): line is string => !!line);
}
