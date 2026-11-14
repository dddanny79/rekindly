import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  NAME_DISPLAY_ORDERS,
  NAME_SORT_ORDERS,
  type UpdateInstanceSettingsRequest,
} from '@app/shared';
import { FormMessage } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { instanceSettingsQuery, useUpdateInstanceSettings } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';

/** Display order ("Jana Berger" / "Berger, Jana") and sort order of names. */
export function NameSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useQuery(instanceSettingsQuery);
  const update = useUpdateInstanceSettings();
  if (!settings.data) return null;

  const change = (patch: UpdateInstanceSettingsRequest) =>
    update.mutate(patch, {
      // Names come from the server everywhere: reload what is cached.
      onSuccess: () =>
        void queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] !== instanceSettingsQuery.queryKey[0],
        }),
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-meta text-muted-foreground">{t('names.displayOrder')}</div>
          <SegmentedControl
            label={t('names.displayOrder')}
            value={settings.data.nameDisplayOrder}
            options={NAME_DISPLAY_ORDERS.map((value) => ({ value, label: t(`names.${value}`) }))}
            onChange={(nameDisplayOrder) => change({ nameDisplayOrder })}
          />
        </div>
        <div>
          <div className="mb-1.5 text-meta text-muted-foreground">{t('names.sortOrder')}</div>
          <SegmentedControl
            label={t('names.sortOrder')}
            value={settings.data.nameSortOrder}
            options={NAME_SORT_ORDERS.map((value) => ({ value, label: t(`names.${value}`) }))}
            onChange={(nameSortOrder) => change({ nameSortOrder })}
          />
        </div>
      </div>
      <FormMessage tone="error">{update.isError && errorMessage(t, update.error)}</FormMessage>
    </div>
  );
}
