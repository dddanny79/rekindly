import { useId, type ReactNode } from 'react';

/** Settings block: label with a strong rule, then content. */
export function SettingsSection({
  title,
  lead,
  children,
}: {
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="mt-9" aria-labelledby={id}>
      <h2 id={id} className="kicker border-b border-border-strong pb-1">
        {title}
      </h2>
      {lead && <p className="mt-2 text-meta text-muted-foreground">{lead}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
