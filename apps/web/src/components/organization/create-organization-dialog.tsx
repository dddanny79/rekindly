import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField, FormMessage } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { organizationsApi, organizationsQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { ORGANIZATION_KINDS } from '@/lib/format';
import { spaceName } from '@/lib/labels';
import { useSelectedSpace } from '@/lib/space-selection';

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  parentId,
  parentSpaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected parent (adding a sub-organization) and its space. */
  parentId?: string;
  parentSpaceId?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { spaces, defaultSpaceId } = useSelectedSpace();
  const [spaceId, setSpaceId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const [parent, setParent] = useState<string>(parentId ?? '');
  const space = parentSpaceId ?? spaceId ?? defaultSpaceId;
  const { data: organizations = [] } = useQuery({
    ...organizationsQuery({ spaceId: space }),
    enabled: open,
  });

  const create = useWrite(() =>
    organizationsApi.create({
      spaceId: space!,
      name,
      kind: kind || null,
      parentId: parent || null,
    }),
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate(undefined, {
      onSuccess: (org) => {
        onOpenChange(false);
        setName('');
        setKind('');
        void navigate({ to: '/organizations/$organizationId', params: { organizationId: org.id } });
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={parentId ? t('organizations.createChild') : t('organizations.create')}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField label={t('organizations.name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </FormField>
          <FormField label={t('organizations.kind')}>
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">–</option>
              {ORGANIZATION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`organizations.kinds.${k}`)}
                </option>
              ))}
            </Select>
          </FormField>
          {!parentId && spaces.length > 1 && (
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
          {!parentId && (
            <FormField label={t('organizations.parent')}>
              <Select value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">{t('organizations.noParent')}</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormMessage tone="error">{create.isError && errorMessage(t, create.error)}</FormMessage>
          <Button type="submit" disabled={create.isPending || !name.trim()} className="self-start">
            {t('organizations.createSubmit')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
