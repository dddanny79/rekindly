import { useTranslation } from 'react-i18next';
import { LanguageRadioGroup } from '@/components/language-controls';
import { PageHeader } from '@/components/page-header';
import { ThemeControl } from '@/components/theme-control';

/** Settings: for now only per-device display preferences. */
export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('nav.settings')} />
      <div className="max-w-md">
        <h2 className="kicker mt-6.5 mb-2 text-muted-foreground">{t('theme.label')}</h2>
        <ThemeControl />
        <p className="mt-2 text-meta text-muted-foreground">{t('theme.hint')}</p>

        <h2 className="kicker mt-6.5 mb-1 text-muted-foreground">{t('language.label')}</h2>
        <LanguageRadioGroup />
      </div>
    </>
  );
}
