import { Link, Outlet } from '@tanstack/react-router';
import { Building2, Sun, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@app/shared';
import { ApiStatus } from '@/components/api-status';
import { LanguageSwitcher } from '@/components/language-switcher';

const NAV_ITEMS = [
  { to: '/', key: 'today', icon: Sun },
  { to: '/people', key: 'people', icon: Users },
  { to: '/organizations', key: 'organizations', icon: Building2 },
] as const;

export function AppShell() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row">
        <nav
          aria-label={t('nav.label')}
          className="border-b px-2 py-2 md:w-56 md:shrink-0 md:border-r md:border-b-0 md:py-4"
        >
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {NAV_ITEMS.map(({ to, key, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  activeOptions={{ exact: true }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-accent hover:text-accent-foreground"
                  activeProps={{ className: 'bg-accent font-medium text-accent-foreground' }}
                  inactiveProps={{ className: 'text-muted-foreground' }}
                >
                  <Icon className="size-4" aria-hidden />
                  {t(`nav.${key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <ApiStatus />
        </div>
      </footer>
    </div>
  );
}
