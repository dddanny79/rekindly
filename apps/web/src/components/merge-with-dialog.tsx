import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Person } from '@app/shared';
import { Combobox } from '@/components/combobox';
import { MergeDialog } from '@/components/merge-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { peopleQuery } from '@/lib/data';

/** “Merge with another person …”: pick the other person, then the merge dialog. */
export function MergeWithDialog({
  person,
  open,
  onOpenChange,
}: {
  person: Person;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: people = [] } = useQuery({
    ...peopleQuery({ listed: 'all' }),
    enabled: open,
  });
  const [other, setOther] = useState<string | null>(null);
  if (other) {
    return (
      <MergeDialog
        ids={[person.id, other]}
        open
        onOpenChange={(next) => {
          if (!next) {
            setOther(null);
            onOpenChange(false);
          }
        }}
      />
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('merge.pickTitle', { name: person.displayName })}>
        <p className="mb-3 text-sm text-foreground-2">{t('merge.pickLead')}</p>
        <Combobox
          label={t('merge.pickLabel')}
          placeholder={t('merge.pickLabel')}
          autoFocus
          options={people
            .filter((p) => p.id !== person.id)
            .map((p) => ({
              value: p.id,
              label: p.displayName,
              hint: [p.organization?.name, p.summary].filter(Boolean).join(' · ') || undefined,
            }))}
          onSelect={(option) => setOther(option.value)}
        />
      </DialogContent>
    </Dialog>
  );
}
