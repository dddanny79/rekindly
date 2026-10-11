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
import { PlaceholderPage } from '@/routes/placeholder-page';
import { SettingsPage } from '@/routes/settings-page';
import { SetupPage } from '@/routes/setup-page';

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

const page = (path: string, titleKey: Parameters<typeof PlaceholderPage>[0]['titleKey']) =>
  createRoute({
    getParentRoute: () => appRoute,
    path,
    component: () => <PlaceholderPage titleKey={titleKey} />,
  });

const routeTree = rootRoute.addChildren([
  setupRoute,
  loginRoute,
  appRoute.addChildren([
    page('/', 'today'),
    page('/people', 'people'),
    page('/organizations', 'organizations'),
    page('/search', 'search'),
    createRoute({ getParentRoute: () => appRoute, path: '/settings', component: SettingsPage }),
    createRoute({ getParentRoute: () => appRoute, path: '/more', component: MorePage }),
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
