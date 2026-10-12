import { Link, type LinkProps } from '@tanstack/react-router';
import { Building2, ChevronRight, Settings, Trash2, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiStatus } from '@/components/api-status';
import { LanguageRadioGroup } from '@/components/language-controls';
import { PageHeader } from '@/components/page-header';
import { ThemeControl } from '@/components/theme-control';
import type { Translations } from '@/i18n/locales/en';

const LINKS: { to: LinkProps['to']; key: keyof Translations['nav']; icon: LucideIcon }[] = [
  { to: '/organizations', key: 'organizations', icon: Building2 },
  { to: '/settings', key: 'settings', icon: Settings },
  { to: '/trash', key: 'trash', icon: Trash2 },
];

/** Mobile overflow page: sections that do not fit into the tab bar. */
export function MorePage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('nav.more')} />
      <nav aria-label={t('nav.moreLabel')}>
        {LINKS.map(({ to, key, icon: Icon }) => (
          <Link
            key={key}
            to={to}
            className="flex min-h-[50px] items-center gap-3.5 border-b no-underline hover:bg-muted"
          >
            <Icon className="size-4" aria-hidden />
            <span className="flex-1">{t(`nav.${key}`)}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </nav>

      <h2 className="kicker mt-6.5 mb-1 text-muted-foreground">{t('language.label')}</h2>
      <LanguageRadioGroup />

      <h2 className="kicker mt-6.5 mb-2 text-muted-foreground">{t('theme.label')}</h2>
      <ThemeControl />

      <ApiStatus className="mt-6.5" />
    </>
  );
}
