import { Link, Outlet, type LinkProps } from '@tanstack/react-router';
import {
  Building2,
  CalendarDays,
  Menu,
  Search,
  Settings,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@app/shared';
import { CommandPalette } from '@/components/command-palette';
import { LanguageToggle } from '@/components/language-controls';
import { SpaceSwitcherList, SpaceSwitcherSheet } from '@/components/space-switcher';
import type { Translations } from '@/i18n/locales/en';
import { useAuthStatus } from '@/lib/auth';
import { setPaletteOpen, usePaletteShortcut } from '@/lib/palette';
import { modKeyLabel } from '@/lib/platform';

interface NavItem {
  to: LinkProps['to'];
  key: keyof Translations['nav'];
  icon: LucideIcon;
}

const SIDEBAR_ITEMS: NavItem[] = [
  { to: '/', key: 'today', icon: CalendarDays },
  { to: '/people', key: 'people', icon: Users },
  { to: '/organizations', key: 'organizations', icon: Building2 },
  { to: '/settings', key: 'settings', icon: Settings },
  { to: '/trash', key: 'trash', icon: Trash2 },
];

const TAB_ITEMS: NavItem[] = [
  { to: '/', key: 'today', icon: CalendarDays },
  { to: '/people', key: 'people', icon: Users },
  { to: '/search', key: 'search', icon: Search },
  { to: '/more', key: 'more', icon: Menu },
];

function AppName({ className }: { className: string }) {
  return (
    <Link
      to="/"
      className={`truncate font-serif font-semibold tracking-[-0.01em] whitespace-nowrap italic no-underline hyphens-none ${className}`}
    >
      {APP_NAME}
    </Link>
  );
}

function Sidebar() {
  const { t } = useTranslation();
  const { data: status } = useAuthStatus();

  return (
    <aside className="sticky top-0 hidden h-dvh w-59 shrink-0 flex-col gap-5.5 border-r px-4 py-5.5 md:flex">
      <AppName className="px-2 text-[1.375rem]" />

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-9.5 cursor-pointer items-center gap-2 rounded-sm border bg-transparent pr-2 pl-2.5 text-left text-sm text-muted-foreground hover:border-input"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1">{t('search.open')}</span>
        <span className="kbd" aria-hidden>
          {modKeyLabel()}K
        </span>
      </button>

      <nav aria-label={t('nav.label')}>
        <ul className="flex flex-col gap-0.5">
          {SIDEBAR_ITEMS.map(({ to, key, icon: Icon }) => (
            <li key={key}>
              <Link
                to={to}
                activeOptions={{ exact: to === '/', includeSearch: false }}
                className="flex h-9 items-center gap-2.5 px-2.5 no-underline hover:bg-muted hover:text-foreground"
                activeProps={{
                  className:
                    'bg-muted font-bold text-foreground shadow-[inset_2px_0_0_var(--signal)]',
                }}
                inactiveProps={{ className: 'text-foreground-2' }}
              >
                <Icon className="size-4" aria-hidden />
                <span className="flex-1">{t(`nav.${key}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <SpaceSwitcherList />

      <div className="flex-1" />

      <div className="flex items-center justify-between gap-2 border-t px-2.5 pt-3">
        <Link
          to="/settings"
          className="min-w-0 truncate text-sm text-foreground-2 no-underline hover:underline"
        >
          {status?.account?.name}
        </Link>
        <LanguageToggle />
      </div>
    </aside>
  );
}

function MobileTopBar() {
  return (
    <div className="flex h-12.5 items-center justify-between gap-3 px-4.5 md:hidden">
      <AppName className="text-[1.3125rem]" />
      <SpaceSwitcherSheet />
    </div>
  );
}

function MobileTabBar() {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border-strong bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-14 grid-cols-4">
        {TAB_ITEMS.map(({ to, key, icon: Icon }) => (
          <li key={key} className="flex">
            <Link
              to={to}
              activeOptions={{ exact: to === '/', includeSearch: false }}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.71875rem] no-underline"
              activeProps={{
                className: 'font-bold text-foreground shadow-[inset_0_2px_0_var(--signal)]',
              }}
              inactiveProps={{ className: 'text-foreground-2' }}
            >
              <Icon className="size-4.5" aria-hidden />
              {t(`nav.${key}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppShell() {
  usePaletteShortcut();
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main className="flex-1 px-4.5 pt-2 pb-[calc(3.5rem+env(safe-area-inset-bottom)+2rem)] md:px-11 md:pt-6.5 md:pb-14">
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
      <CommandPalette />
    </div>
  );
}
