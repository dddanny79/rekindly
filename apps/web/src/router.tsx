import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { z } from 'zod';
import { AppShell } from '@/components/app-shell';
import { authStatusQuery } from '@/lib/auth';
import { safeRedirect } from '@/lib/redirect';
import { LoginPage } from '@/routes/login-page';
import { MorePage } from '@/routes/more-page';
import { NotFoundPage } from '@/routes/not-found-page';
import { OrganizationPage } from '@/routes/organization-page';
import { OrganizationsPage } from '@/routes/organizations-page';
import { PeoplePage } from '@/routes/people-page';
import { PersonPage } from '@/routes/person-page';
import { SearchPage } from '@/routes/search-page';
import { SettingsPage } from '@/routes/settings-page';
import {
  FieldsSettingsPage,
  RelationshipTypesSettingsPage,
  SpacesSettingsPage,
  TagsSettingsPage,
} from '@/routes/settings/catalog-pages';
import { SettingsLayout } from '@/routes/settings/settings-layout';
import { DataSettingsPage } from '@/routes/settings/data-page';
import { ImportSettingsPage } from '@/routes/settings/import-page';
import { SyncSettingsPage } from '@/routes/settings/sync-page';
import { SetupPage } from '@/routes/setup-page';
import { TodayPage } from '@/routes/today-page';
import { TrashPage } from '@/routes/trash-page';

export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <main className="px-4.5 py-6 md:px-11">
      <NotFoundPage />
    </main>
  ),
});

/** Only reachable until the account exists. */
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  beforeLoad: async ({ context }) => {
    const status = await context.queryClient.ensureQueryData(authStatusQuery);
    if (!status.setupRequired) throw redirect({ to: status.authenticated ? '/' : '/login' });
  },
  component: SetupPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context, search }) => {
    const status = await context.queryClient.ensureQueryData(authStatusQuery);
    if (status.setupRequired) throw redirect({ to: '/setup' });
    if (status.authenticated) throw redirect({ to: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

/** Everything inside the shell needs a session. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context, location }) => {
    const status = await context.queryClient.ensureQueryData(authStatusQuery);
    if (status.setupRequired) throw redirect({ to: '/setup' });
    if (!status.authenticated) {
      throw redirect({
        to: '/login',
        search: location.href === '/' ? {} : { redirect: location.href },
      });
    }
  },
  component: AppShell,
});

const child = <P extends string>(path: P, component: () => React.ReactNode) =>
  createRoute({ getParentRoute: () => appRoute, path, component });

const personRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/people/$personId',
  // `compose=call`: start a call entry (from the command palette).
  validateSearch: z.object({ compose: z.enum(['call']).optional() }),
  component: PersonPage,
});

const searchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/search',
  validateSearch: z.object({
    q: z.string().optional(),
    type: z.enum(['person', 'organization']).optional(),
    tag: z.string().optional(),
    org: z.string().optional(),
  }),
  component: SearchPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsLayout,
});
const settingsChild = <P extends string>(path: P, component: () => React.ReactNode) =>
  createRoute({ getParentRoute: () => settingsRoute, path, component });

const routeTree = rootRoute.addChildren([
  setupRoute,
  loginRoute,
  appRoute.addChildren([
    child('/', TodayPage),
    child('/people', PeoplePage),
    personRoute,
    child('/organizations', OrganizationsPage),
    child('/organizations/$organizationId', OrganizationPage),
    searchRoute,
    child('/trash', TrashPage),
    settingsRoute.addChildren([
      settingsChild('/', SettingsPage),
      settingsChild('/spaces', SpacesSettingsPage),
      settingsChild('/tags', TagsSettingsPage),
      settingsChild('/relationship-types', RelationshipTypesSettingsPage),
      settingsChild('/fields', FieldsSettingsPage),
      settingsChild('/sync', SyncSettingsPage),
      settingsChild('/data', DataSettingsPage),
      settingsChild('/import', ImportSettingsPage),
    ]),
    child('/more', MorePage),
  ]),
]);

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({ routeTree, history, context: { queryClient } });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
