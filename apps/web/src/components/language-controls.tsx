import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type Language } from '@/i18n';
import { cn } from '@/lib/utils';

function useLanguage() {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? 'en') as Language;
  return { current, change: (lng: Language) => void i18n.changeLanguage(lng) };
}

/** Compact “DE · EN” toggle for the desktop sidebar. */
export function LanguageToggle() {
  const { t } = useTranslation();
  const { current, change } = useLanguage();
  const next = SUPPORTED_LANGUAGES.find((lng) => lng !== current) ?? 'en';

  return (
    <button
      type="button"
      onClick={() => change(next)}
      aria-label={t('language.toggle', {
        current: t(`language.${current}`),
        next: t(`language.${next}`),
      })}
      className="cursor-pointer py-1.5 text-meta whitespace-nowrap text-foreground-2"
    >
      {[current, ...SUPPORTED_LANGUAGES.filter((lng) => lng !== current)].map((lng, i) => (
        <span key={lng}>
          {i > 0 && <span className="text-muted-foreground"> · </span>}
          {lng === current ? (
            <strong className="uppercase">{lng}</strong>
          ) : (
            <span className="text-muted-foreground uppercase">{lng}</span>
          )}
        </span>
      ))}
    </button>
  );
}

/** Full-width radio list for the mobile “More” page. */
export function LanguageRadioGroup() {
  const { t } = useTranslation();
  const { current, change } = useLanguage();

  return (
    <div
      role="radiogroup"
      aria-label={t('language.label')}
      className="border-t border-border-strong"
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const checked = lng === current;
        return (
          <button
            key={lng}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => change(lng)}
            className={cn(
              'flex min-h-[50px] w-full cursor-pointer items-center gap-3.5 border-b text-left',
              checked ? 'font-bold text-foreground' : 'text-foreground-2',
            )}
          >
            <span className="flex-1">{t(`language.${lng}`)}</span>
            {checked && <Check className="size-4" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
