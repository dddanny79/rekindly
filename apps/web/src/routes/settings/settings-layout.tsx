import { Link, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';

const TABS = [
  { to: '/settings', key: 'general' },
  { to: '/settings/spaces', key: 'spaces' },
  { to: '/settings/tags', key: 'tags' },
  { to: '/settings/relationship-types', key: 'relationshipTypes' },
  { to: '/settings/fields', key: 'fields' },
  { to: '/settings/sync', key: 'sync' },
  { to: '/settings/data', key: 'data' },
  { to: '/settings/import', key: 'import' },
  { to: '/settings/ai', key: 'ai' },
  { to: '/settings/api', key: 'api' },
] as const;

export function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('nav.settings')} />
      <nav aria-label={t('settings.sections')} className="mt-3 -mb-px overflow-x-auto">
        <ul className="flex gap-5 border-b whitespace-nowrap">
          {TABS.map((tab) => (
            <li key={tab.key}>
              <Link
                to={tab.to}
                activeOptions={{ exact: true }}
                className="block py-2 text-sm no-underline"
                activeProps={{
                  className: 'font-bold text-foreground shadow-[inset_0_-2px_0_var(--foreground)]',
                }}
                inactiveProps={{ className: 'text-foreground-2 hover:text-foreground' }}
              >
                {t(`settings.tabs.${tab.key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="max-w-xl">
        <Outlet />
      </div>
    </>
  );
}
