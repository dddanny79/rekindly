import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { setUnauthorizedHandler } from '@/lib/api';
import { authStatusQuery } from '@/lib/auth';
import { createAppRouter } from '@/router';

export function App({ history }: { history?: RouterHistory }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const [router] = useState(() => createAppRouter(queryClient, history));

  useEffect(() => {
    // Session expired or revoked elsewhere: re-check and let the guards redirect.
    setUnauthorizedHandler(() => {
      void queryClient.invalidateQueries(authStatusQuery).then(() => router.invalidate());
    });
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
