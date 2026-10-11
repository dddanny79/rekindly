import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchHealth } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ApiStatusProps {
  className?: string;
  /** Show only the version; the status text stays available to screen readers. */
  compact?: boolean;
}

export function ApiStatus({ className, compact = false }: ApiStatusProps) {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });

  const label = health.isPending
    ? t('status.apiChecking')
    : health.isSuccess
      ? t('status.apiOk')
      : t('status.apiDown');

  return (
    <p
      title={compact ? label : undefined}
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
        <span className={compact ? 'sr-only' : undefined}>
          {label}
          {health.data && ' · '}
        </span>
        {health.data && `v${health.data.version}`}
      </span>
    </p>
  );
}
