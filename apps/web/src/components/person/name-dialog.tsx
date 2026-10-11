import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Person } from '@app/shared';
import { FormField, FormMessage } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { peopleApi, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';

const FIELDS = [
  'prefix',
  'firstName',
  'middleName',
  'lastName',
  'suffix',
  'nickname',
  'maidenName',
  'pronouns',
] as const;
type NameField = (typeof FIELDS)[number];

/** All name parts at once; the header shows the composed name. */
export function NameDialog({
  person,
  open,
  onOpenChange,
}: {
  person: Person;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const initial = () =>
    Object.fromEntries(FIELDS.map((f) => [f, person[f] ?? ''])) as Record<NameField, string>;
  const [form, setForm] = useState(initial);
  const save = useWrite((patch: Record<NameField, string>) => peopleApi.update(person.id, patch));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate(form, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(initial());
        save.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent title={t('person.name.title')}>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
          {FIELDS.map((field) => (
            <div
              key={field}
              className={
                field === 'firstName' || field === 'lastName'
                  ? 'col-span-2 sm:col-span-1'
                  : 'col-span-2 sm:col-span-1'
              }
            >
              <FormField label={t(`person.name.${field}`)}>
                <Input
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  autoFocus={field === 'firstName'}
                />
              </FormField>
            </div>
          ))}
          <div className="col-span-2 flex flex-col gap-3">
            <FormMessage tone="error">{save.isError && errorMessage(t, save.error)}</FormMessage>
            <Button type="submit" disabled={save.isPending} className="self-start">
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
