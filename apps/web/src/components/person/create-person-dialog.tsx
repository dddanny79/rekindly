import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox } from '@/components/combobox';
import { FormField, FormMessage } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { organizationsApi, organizationsQuery, peopleApi, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { spaceName } from '@/lib/labels';
import { useSelectedSpace } from '@/lib/space-selection';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Quick entry: name, optionally organization and role; everything else on the person page. */
export function CreatePersonDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { spaces, defaultSpaceId } = useSelectedSpace();
  const [spaceId, setSpaceId] = useState<string | undefined>(undefined);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const hasName = !!(firstName.trim() || lastName.trim());
  const [org, setOrg] = useState<{ id?: string; name: string } | null>(null);
  const [role, setRole] = useState('');
  const space = spaceId ?? defaultSpaceId;
  const { data: organizations = [] } = useQuery({
    ...organizationsQuery({ spaceId: space }),
    enabled: open && !!space,
  });

  const create = useWrite(async () => {
    let organizationId = org?.id;
    if (org && !organizationId) {
      organizationId = (await organizationsApi.create({ spaceId: space!, name: org.name })).id;
    }
    return peopleApi.create({
      spaceId: space!,
      firstName,
      lastName,
      organizationId,
      role: organizationId ? role || null : undefined,
    });
  });

  function reset() {
    setFirstName('');
    setLastName('');
    setOrg(null);
    setRole('');
    setSpaceId(undefined);
    create.reset();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!hasName || !space) return;
    create.mutate(undefined, {
      onSuccess: (person) => {
        onOpenChange(false);
        reset();
        void navigate({ to: '/people/$personId', params: { personId: person.id } });
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent title={t('people.create.title')}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <p className="-mt-2 text-meta text-muted-foreground">{t('people.create.nameHint')}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={t('person.name.firstName')}>
              <Input
                autoComplete="off"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
              />
            </FormField>
            <FormField label={t('person.name.lastName')}>
              <Input
                autoComplete="off"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </FormField>
          </div>
          {spaces.length > 1 && (
            <FormField label={t('spaces.label')}>
              <Select value={space} onChange={(e) => setSpaceId(e.target.value)}>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {spaceName(t, s)}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>{t('people.create.organization')}</Label>
            {org ? (
              <div className="flex items-center justify-between gap-2 rounded-sm border border-input bg-popover px-2.5 py-1.5">
                <span className="truncate">
                  {org.name}
                  {!org.id && (
                    <span className="text-meta text-muted-foreground"> · {t('common.new')}</span>
                  )}
                </span>
                <Button type="button" size="xs" variant="ghost" onClick={() => setOrg(null)}>
                  {t('common.remove')}
                </Button>
              </div>
            ) : (
              <Combobox
                label={t('people.create.organization')}
                placeholder={t('common.optional')}
                options={organizations.map((o) => ({ value: o.id, label: o.name }))}
                onSelect={(o) => setOrg({ id: o.value, name: o.label })}
                onCreate={(query) => setOrg({ name: query })}
                createLabel={(query) => t('organizations.createNamed', { name: query })}
              />
            )}
          </div>
          {org && (
            <FormField label={t('people.create.role')}>
              <Input value={role} onChange={(e) => setRole(e.target.value)} />
            </FormField>
          )}
          <FormMessage tone="error">{create.isError && errorMessage(t, create.error)}</FormMessage>
          <Button type="submit" disabled={create.isPending || !hasName} className="self-start">
            {t('people.create.submit')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
