import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import type { Translations } from '@/i18n/locales/en';

export function PlaceholderPage({ titleKey }: { titleKey: keyof Translations['nav'] }) {
  const { t } = useTranslation();

  return (
    <PageHeader
      kicker={t('placeholder.kicker')}
      title={t(`nav.${titleKey}`)}
      lead={t('placeholder.body')}
    />
  );
}
