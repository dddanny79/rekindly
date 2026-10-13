import { useTranslation } from 'react-i18next';
import type { PersonDateKind } from '@app/shared';

/**
 * Names and year counts of recurring days. Tactful: a memorial day counts the
 * years since (“10 years ago”), never what someone “turns”; name days have none.
 */
export function useDayText() {
  const { t } = useTranslation();
  return {
    label: (day: { kind: PersonDateKind; label: string | null }) =>
      day.label ?? t(`personDates.kinds.${day.kind}`),
    years: (kind: PersonDateKind, years: number | null) => {
      if (!years || kind === 'nameday') return null;
      return kind === 'memorial'
        ? t('personDates.yearsSince', { count: years })
        : t('personDates.years', { count: years });
    },
  };
}
