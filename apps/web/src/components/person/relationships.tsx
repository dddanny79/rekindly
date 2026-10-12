import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Relationship } from '@app/shared';
import { Avatar } from '@/components/avatar';
import { Combobox } from '@/components/combobox';
import { FormMessage } from '@/components/form-field';
import { RemoveButton } from '@/components/row-actions';
import { EmptyRow, SideRow, SideSection } from '@/components/side-section';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { peopleApi, peopleQuery, relationshipTypesQuery, spacesQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { labelText } from '@/lib/labels';

/** “Lea Maria Berger” → first “Lea Maria”, last “Berger”; one word → first name. */
function splitName(name: string): [string | null, string | null] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [words[0] ?? null, null];
  return [words.slice(0, -1).join(' '), words.at(-1)!];
}

/** “[person] is [role] of this person”; each directed type offers both directions. */
function RelationshipForm({
  personId,
  personName,
  onDone,
}: {
  personId: string;
  personName: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { data: types = [] } = useQuery(relationshipTypesQuery);
  // Indirect contacts can be linked too (e.g. Lea is also Tom's daughter).
  const { data: people = [] } = useQuery(peopleQuery({ listed: 'all' }));
  const { data: spaces = [] } = useQuery(spacesQuery);
  // An existing person, or a new one (`listed` false = indirect contact).
  const [other, setOther] = useState<
    { id: string; name: string } | { id?: undefined; name: string; listed: boolean } | null
  >(null);
  const [choice, setChoice] = useState('');

  const roles = types.flatMap((type) => {
    const forward = {
      key: `${type.id}:f`,
      label: labelText(t, type),
      typeId: type.id,
      reverse: false,
    };
    if (type.symmetric) return [forward];
    const reverse = {
      key: `${type.id}:r`,
      label: labelText(t, { name: type.reverseName, nameKey: type.reverseNameKey }),
      typeId: type.id,
      reverse: true,
    };
    return [forward, reverse];
  });

  const add = useWrite(
    (input: {
      personId?: string;
      newPerson?: { firstName: string | null; lastName: string | null; listed: boolean };
      typeId: string;
      reverse: boolean;
    }) => peopleApi.addItem(personId, 'relationships', input),
    { onSuccess: onDone },
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const role = roles.find((r) => r.key === choice);
    if (!other || !role) return;
    if (other.id) {
      add.mutate({ personId: other.id, typeId: role.typeId, reverse: role.reverse });
    } else {
      const [firstName, lastName] = splitName(other.name);
      add.mutate({
        newPerson: { firstName, lastName, listed: !('listed' in other) || other.listed },
        typeId: role.typeId,
        reverse: role.reverse,
      });
    }
  }

  const colorOf = (spaceId: string) => spaces.find((s) => s.id === spaceId)?.color ?? null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-b py-3">
      {other ? (
        <div className="flex items-center justify-between gap-2 rounded-sm border border-input bg-popover px-2.5 py-1.5">
          <span className="truncate">
            {other.name}
            {!other.id && (
              <span className="text-meta text-muted-foreground">
                {' · '}
                {'listed' in other && other.listed
                  ? t('relationship.newContact')
                  : t('relationship.newIndirect')}
              </span>
            )}
          </span>
          <Button type="button" size="xs" variant="ghost" onClick={() => setOther(null)}>
            {t('common.change')}
          </Button>
        </div>
      ) : (
        <Combobox
          label={t('relationship.person')}
          placeholder={t('relationship.person')}
          autoFocus
          options={people
            .filter((p) => p.id !== personId)
            .map((p) => ({
              value: p.id,
              label: p.displayName,
              hint: p.listed ? p.organization?.name : t('indirect.label'),
              icon: (
                <Avatar
                  initials={p.initials}
                  photoUrl={p.photoUrl}
                  color={colorOf(p.spaceId)}
                  size={24}
                />
              ),
            }))}
          onSelect={(o) => setOther({ id: o.value, name: o.label })}
          createOptions={[
            {
              label: (name) => t('relationship.createIndirect', { name }),
              onCreate: (name) => setOther({ name, listed: false }),
            },
            {
              label: (name) => t('relationship.createContact', { name }),
              onCreate: (name) => setOther({ name, listed: true }),
            },
          ]}
        />
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="relationship-role">
          {other
            ? t('relationship.isOf', { person: other.name, of: personName })
            : t('relationship.role')}
        </Label>
        <Select
          id="relationship-role"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          required
        >
          <option value="" disabled>
            {t('relationship.chooseRole')}
          </option>
          {roles.map((role) => (
            <option key={role.key} value={role.key}>
              {role.label}
            </option>
          ))}
        </Select>
      </div>
      <FormMessage tone="error">{add.isError && errorMessage(t, add.error)}</FormMessage>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={add.isPending || !other || !choice}>
          {t('common.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

export function RelationshipsSection({
  personId,
  personName,
  relationships,
}: {
  personId: string;
  personName: string;
  relationships: Relationship[];
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const remove = useWrite((id: string) => peopleApi.removeItem(personId, 'relationships', id));

  return (
    <SideSection
      title={t('relationship.title')}
      addLabel={t('relationship.add')}
      onAdd={() => setAdding(true)}
    >
      {relationships.length === 0 && !adding && <EmptyRow>{t('relationship.empty')}</EmptyRow>}
      {relationships.map((r) => (
        <SideRow
          key={r.id}
          actions={
            <RemoveButton
              label={t('common.removeNamed', { name: r.person.displayName })}
              title={t('relationship.removeTitle', { name: r.person.displayName })}
              description={t('relationship.removeBody')}
              onConfirm={() => remove.mutate(r.id)}
            />
          }
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <Link to="/people/$personId" params={{ personId: r.person.id }} className="underline">
              {r.person.displayName}
            </Link>
            <span className="text-meta text-muted-foreground">{labelText(t, r.label)}</span>
          </div>
        </SideRow>
      ))}
      {adding && (
        <RelationshipForm
          personId={personId}
          personName={personName}
          onDone={() => setAdding(false)}
        />
      )}
    </SideSection>
  );
}
