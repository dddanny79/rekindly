import type { ReactNode } from 'react';

interface PageHeaderProps {
  kicker?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}

/** Page header from the design: kicker, serif title, italic lead, double rule. */
export function PageHeader({ kicker, title, lead, actions }: PageHeaderProps) {
  return (
    <header className="rule-double flex flex-wrap items-end gap-x-8 gap-y-4 pb-3 md:pb-4.5">
      <div className="min-w-0 flex-[1_1_420px]">
        {kicker && <div className="kicker text-muted-foreground">{kicker}</div>}
        <h1 className="mt-0.5 font-serif text-title md:text-[3.25rem] md:leading-none md:tracking-[-0.025em]">
          {title}
        </h1>
        {lead && (
          <p className="mt-2 font-serif text-lg text-foreground-2 italic md:text-xl">{lead}</p>
        )}
      </div>
      {actions}
    </header>
  );
}
