import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchHealth } from '@/lib/api';
import { cn } from '@/lib/utils';

export function ApiStatus() {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });

  const label = health.isPending
    ? t('status.apiChecking')
    : health.isSuccess
      ? t('status.apiOk')
      : t('status.apiDown');

  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="api-status">
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          health.isPending && 'bg-muted-foreground',
          health.isSuccess && 'bg-emerald-500',
          health.isError && 'bg-destructive',
        )}
      />
      <span>
        {label}
        {health.data && ` · v${health.data.version}`}
      </span>
    </p>
  );
}
