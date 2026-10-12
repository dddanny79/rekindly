import type { ReactNode } from 'react';
import { LanguageToggle } from '@/components/language-controls';
import { Logo } from '@/components/logo';
import { PageHeader } from '@/components/page-header';

/** Narrow, centred page for setup and sign-in (outside the app shell). */
export function AuthLayout({
  kicker,
  title,
  lead,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col px-4.5 py-6 md:py-14">
      <main className="mx-auto flex w-full max-w-100 flex-1 flex-col">
        <div className="mb-8">
          <Logo variant="subtitle" className="h-16" />
        </div>
        <PageHeader kicker={kicker} title={title} lead={lead} />
        <div className="mt-6">{children}</div>
      </main>
      <footer className="mx-auto mt-10 flex w-full max-w-100 justify-end border-t pt-3">
        <LanguageToggle />
      </footer>
    </div>
  );
}
