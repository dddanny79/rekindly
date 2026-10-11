import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Sidebar block from the design: caps label, strong rule, rows with hairlines. */
export function SideSection({
  title,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  addLabel?: string;
  onAdd?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section aria-label={title} className="mt-7 first:mt-0">
      <div className="flex items-center justify-between border-b border-border-strong pb-1">
        <h2 className="kicker whitespace-nowrap hyphens-none">{title}</h2>
        {onAdd && (
          <Button size="xs" variant="ghost" onClick={onAdd} aria-label={addLabel}>
            <Plus aria-hidden />
            <span aria-hidden className="hidden md:inline">
              {t('common.add')}
            </span>
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Row with hover actions (edit/remove); actions stay visible on touch screens. */
export function SideRow({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="group flex items-start gap-2 border-b py-2">
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {actions && (
        <div className="flex shrink-0 gap-0.5 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="border-b py-2 text-sm text-muted-foreground">{children}</p>;
}
