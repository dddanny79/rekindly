import { useTranslation } from 'react-i18next';
import type { Translations } from '@/i18n/locales/en';

export function PlaceholderPage({ titleKey }: { titleKey: keyof Translations['nav'] }) {
  const { t } = useTranslation();

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{t(`nav.${titleKey}`)}</h1>
      <p className="text-muted-foreground">
        {t('placeholder.title')} — {t('placeholder.body')}
      </p>
    </section>
  );
}
