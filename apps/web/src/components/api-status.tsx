import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchHealth } from '@/lib/api';
import { cn } from '@/lib/utils';

export function ApiStatus({ className }: { className?: string }) {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });

  const label = health.isPending
    ? t('status.apiChecking')
    : health.isSuccess
      ? t('status.apiOk')
      : t('status.apiDown');

  return (
    <p
      className={cn('flex items-center gap-2 text-meta text-muted-foreground', className)}
      data-testid="api-status"
    >
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          health.isPending && 'bg-border',
          health.isSuccess && 'bg-area-private',
          health.isError && 'bg-destructive',
        )}
      />
      <span className="num whitespace-nowrap">
        {label}
        {health.data && ` · v${health.data.version}`}
      </span>
    </p>
  );
}
