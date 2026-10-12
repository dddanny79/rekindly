import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Affiliation } from '@app/shared';
import { Combobox } from '@/components/combobox';
import { FormMessage } from '@/components/form-field';
import { EditButton, RemoveButton } from '@/components/row-actions';
import { EmptyRow, SideRow, SideSection } from '@/components/side-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { organizationsApi, organizationsQuery, peopleApi, spacesQuery, useWrite } from '@/lib/data';
import { formatPartialDate, parsePartialDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { spaceName } from '@/lib/labels';

interface FormValue {
  role: string;
  startedOn: string;
  endedOn: string;
  isPrimary: boolean;
}

function AffiliationForm({
  spaceId,
  personName,
  initial,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  spaceId: string;
  personName: string;
  initial?: Affiliation;
  onSubmit: (input: {
    organization?: { id?: string; name: string };
    /** The organization is in another space: move the person there first. */
    moveToSpaceId?: string;
    role: string | null;
    startedOn: string | null;
    endedOn: string | null;
    isPrimary: boolean;
  }) => void;
  onCancel: () => void;
  pending: boolean;
  error: unknown;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  // All spaces: organizations elsewhere are offered too, marked with their space.
  const { data: organizations = [] } = useQuery(organizationsQuery({}));
  const { data: spaces = [] } = useQuery(spacesQuery);
  const [org, setOrg] = useState<{ id?: string; name: string; spaceId?: string } | null>(null);
  const nameOf = (id: string | undefined) => {
    const space = spaces.find((s) => s.id === id);
    return space ? spaceName(t, space) : '';
  };
  const otherSpace = org?.spaceId && org.spaceId !== spaceId ? org.spaceId : undefined;
  const options = [
    ...organizations.filter((o) => o.spaceId === spaceId),
    ...organizations.filter((o) => o.spaceId !== spaceId),
  ].map((o) => ({
    value: o.id,
    label: o.name,
    hint: o.spaceId === spaceId ? undefined : nameOf(o.spaceId),
  }));
  const [form, setForm] = useState<FormValue>({
    role: initial?.role ?? '',
    startedOn: initial?.startedOn ? formatPartialDate(initial.startedOn, locale) : '',
    endedOn: initial?.endedOn ? formatPartialDate(initial.endedOn, locale) : '',
    isPrimary: initial?.isPrimary ?? false,
  });
  const [dateError, setDateError] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const startedOn = parsePartialDate(form.startedOn);
    const endedOn = parsePartialDate(form.endedOn);
    if (startedOn === undefined || endedOn === undefined) return setDateError(true);
    if (!initial && !org) return;
    onSubmit({
      organization: org ?? undefined,
      moveToSpaceId: otherSpace,
      role: form.role.trim() || null,
      startedOn,
      endedOn,
      isPrimary: form.isPrimary,
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-b py-3">
      {!initial &&
        (org ? (
          <div className="flex items-center justify-between gap-2 rounded-sm border border-input bg-popover px-2.5 py-1.5">
            <span className="truncate">
              {org.name}
              {!org.id && (
                <span className="text-meta text-muted-foreground"> · {t('common.new')}</span>
              )}
            </span>
            <Button type="button" size="xs" variant="ghost" onClick={() => setOrg(null)}>
              {t('common.change')}
            </Button>
          </div>
        ) : (
          <Combobox
            label={t('affiliation.organization')}
            placeholder={t('affiliation.organization')}
            autoFocus
            options={options}
            onSelect={(o) =>
              setOrg({
                id: o.value,
                name: o.label,
                spaceId: organizations.find((x) => x.id === o.value)?.spaceId,
              })
            }
            onCreate={(query) => setOrg({ name: query })}
            createLabel={(query) => t('organizations.createNamed', { name: query })}
          />
        ))}
      {otherSpace && org && (
        <p className="text-sm text-foreground-2" role="note">
          {t('affiliation.otherSpace', {
            org: org.name,
            orgSpace: nameOf(otherSpace),
            person: personName,
            personSpace: nameOf(spaceId),
          })}
        </p>
      )}
      <Input
        aria-label={t('affiliation.role')}
        placeholder={t('affiliation.role')}
        value={form.role}
        onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
        autoFocus={!!initial}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          aria-label={t('affiliation.from')}
          placeholder={t('affiliation.from')}
          value={form.startedOn}
          onChange={(e) => setForm((f) => ({ ...f, startedOn: e.target.value }))}
        />
        <Input
          aria-label={t('affiliation.to')}
          placeholder={t('affiliation.to')}
          value={form.endedOn}
          onChange={(e) => setForm((f) => ({ ...f, endedOn: e.target.value }))}
        />
      </div>
      {dateError && (
        <p className="text-[0.78125rem] text-destructive">{t('affiliation.dateHint')}</p>
      )}
      <label className="flex items-center gap-2 text-sm text-foreground-2">
        <input
          type="checkbox"
          checked={form.isPrimary}
          onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
        />
        {t('affiliation.primary')}
      </label>
      <FormMessage tone="error">{error ? errorMessage(t, error) : null}</FormMessage>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || (!initial && !org)}>
          {otherSpace ? t('affiliation.moveAndSave') : t('common.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

export function AffiliationsSection({
  personId,
  personName,
  spaceId,
  affiliations,
}: {
  personId: string;
  personName: string;
  spaceId: string;
  affiliations: Affiliation[];
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const add = useWrite(
    async (input: Parameters<Parameters<typeof AffiliationForm>[0]['onSubmit']>[0]) => {
      const { organization, moveToSpaceId, ...rest } = input;
      // Spaces stay separate: the person moves to the organization's space.
      if (moveToSpaceId) await peopleApi.update(personId, { spaceId: moveToSpaceId });
      const organizationId =
        organization!.id ??
        (await organizationsApi.create({ spaceId, name: organization!.name })).id;
      return peopleApi.addItem(personId, 'affiliations', { organizationId, ...rest });
    },
    { onSuccess: () => setAdding(false) },
  );
  const update = useWrite(
    ({ id, input }: { id: string; input: unknown }) =>
      peopleApi.updateItem(personId, 'affiliations', id, input),
    { onSuccess: () => setEditing(null) },
  );
  const remove = useWrite((id: string) => peopleApi.removeItem(personId, 'affiliations', id));

  const period = (a: Affiliation) => {
    if (!a.startedOn && !a.endedOn) return null;
    const from = a.startedOn ? formatPartialDate(a.startedOn, locale) : '…';
    const to = a.endedOn ? formatPartialDate(a.endedOn, locale) : t('affiliation.today');
    return `${from} – ${to}`;
  };

  return (
    <SideSection
      title={t('affiliation.title')}
      addLabel={t('affiliation.add')}
      onAdd={() => setAdding(true)}
    >
      {affiliations.length === 0 && !adding && <EmptyRow>{t('affiliation.empty')}</EmptyRow>}
      {affiliations.map((a) =>
        editing === a.id ? (
          <AffiliationForm
            key={a.id}
            spaceId={spaceId}
            personName={personName}
            initial={a}
            pending={update.isPending}
            error={update.error}
            onCancel={() => setEditing(null)}
            onSubmit={({ organization: _, moveToSpaceId: __, ...input }) =>
              update.mutate({ id: a.id, input })
            }
          />
        ) : (
          <SideRow
            key={a.id}
            actions={
              <>
                <EditButton
                  label={t('common.editNamed', { name: a.organization.name })}
                  onClick={() => setEditing(a.id)}
                />
                <RemoveButton
                  label={t('common.removeNamed', { name: a.organization.name })}
                  title={t('affiliation.removeTitle', { name: a.organization.name })}
                  onConfirm={() => remove.mutate(a.id)}
                />
              </>
            }
          >
            <Link
              to="/organizations/$organizationId"
              params={{ organizationId: a.organization.id }}
              className={a.endedOn ? 'text-foreground-2 underline' : 'font-semibold underline'}
            >
              {a.organization.name}
            </Link>
            {a.organization.path.length > 1 && (
              <div className="text-meta text-muted-foreground">
                {a.organization.path
                  .slice(0, -1)
                  .map((p) => p.name)
                  .join(' › ')}
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-x-3 text-sm text-foreground-2">
              <span>
                {a.role}
                {a.isPrimary && (
                  <span className="text-muted-foreground"> · {t('affiliation.primaryShort')}</span>
                )}
              </span>
              {period(a) && (
                <span className="num text-meta text-muted-foreground">{period(a)}</span>
              )}
            </div>
          </SideRow>
        ),
      )}
      {adding && (
        <AffiliationForm
          spaceId={spaceId}
          personName={personName}
          pending={add.isPending}
          error={add.error}
          onCancel={() => setAdding(false)}
          onSubmit={(input) => add.mutate(input)}
        />
      )}
    </SideSection>
  );
}
