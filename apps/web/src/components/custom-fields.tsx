import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { type FieldDefinition, type FieldValue, normalizeFieldValue } from '@app/shared';
import { InlineText } from '@/components/inline-edit';
import { EmptyRow, SideSection } from '@/components/side-section';
import { Select } from '@/components/ui/select';
import { fieldDefinitionsQuery, useWrite } from '@/lib/data';

function FieldInput({
  definition,
  value,
  onSave,
}: {
  definition: FieldDefinition;
  value: string | null;
  onSave: (value: string) => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  if (definition.type === 'select' || definition.type === 'boolean') {
    const options =
      definition.type === 'boolean'
        ? [
            { value: 'true', label: t('common.yes') },
            { value: 'false', label: t('common.no') },
          ]
        : (definition.options ?? []).map((o) => ({ value: o, label: o }));
    return (
      <Select
        aria-label={definition.label}
        value={value ?? ''}
        onChange={(e) => void onSave(e.target.value)}
      >
        <option value="">–</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }
  const display =
    value && definition.type === 'date'
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
          dateStyle: 'medium',
          timeZone: 'UTC',
        }).format(new Date(`${value}T00:00:00Z`))
      : value && definition.type === 'url'
        ? value.replace(/^https?:\/\//, '').replace(/\/$/, '')
        : undefined;
  return (
    <InlineText
      label={definition.label}
      value={value}
      display={display}
      placeholder={definition.type === 'date' ? 'JJJJ-MM-TT' : undefined}
      validate={(input) =>
        input.trim() === '' || normalizeFieldValue(definition, input) !== null
          ? null
          : t(`fields.invalid.${definition.type}`)
      }
      onSave={onSave}
    />
  );
}

/** Custom fields of a person or an organization, edited in place. */
export function CustomFieldsSection({
  target,
  values,
  onSave,
}: {
  target: FieldDefinition['target'];
  values: FieldValue[];
  onSave: (definitionId: string, value: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { data: definitions = [] } = useQuery(fieldDefinitionsQuery(target));
  const save = useWrite(({ id, value }: { id: string; value: string }) => onSave(id, value));

  return (
    <SideSection title={t('fields.title')}>
      {definitions.length === 0 && (
        <EmptyRow>
          {t('fields.none')}{' '}
          <Link to="/settings/fields" className="underline">
            {t('fields.manage')}
          </Link>
        </EmptyRow>
      )}
      {definitions.map((definition) => (
        <div
          key={definition.id}
          className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-x-3 border-b py-1.5"
        >
          <span className="text-meta text-muted-foreground">{definition.label}</span>
          <FieldInput
            definition={definition}
            value={values.find((v) => v.definitionId === definition.id)?.value ?? null}
            onSave={(value) => save.mutateAsync({ id: definition.id, value })}
          />
        </div>
      ))}
    </SideSection>
  );
}
