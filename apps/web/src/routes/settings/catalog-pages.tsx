import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FIELD_TYPES, SPACE_COLORS, type FieldDefinition, type SpaceColor } from '@app/shared';
import { FormField, FormMessage } from '@/components/form-field';
import { InlineText } from '@/components/inline-edit';
import { RemoveButton } from '@/components/row-actions';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  catalogApi,
  fieldDefinitionsQuery,
  relationshipTypesQuery,
  spacesQuery,
  tagsQuery,
  useWrite,
} from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { labelText, spaceColor, spaceName } from '@/lib/labels';

const ALL_DATA = [
  ['spaces'],
  ['tags'],
  ['relationship-types'],
  ['field-definitions'],
  ['people'],
  ['organizations'],
];

function useCatalogWrite<T>(fn: (input: T) => Promise<unknown>, onSuccess?: () => void) {
  return useWrite(fn, { invalidate: ALL_DATA, onSuccess });
}

function Row({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </li>
  );
}

// Spaces -----------------------------------------------------------------------------

export function SpacesSettingsPage() {
  const { t } = useTranslation();
  const { data: spaces = [] } = useQuery(spacesQuery);
  const [name, setName] = useState('');
  const create = useCatalogWrite(
    (input: { name: string }) => catalogApi.create('spaces', input),
    () => setName(''),
  );
  const update = useCatalogWrite(
    ({ id, ...input }: { id: string; name?: string; color?: SpaceColor; aiAllowed?: boolean }) =>
      catalogApi.update('spaces', id, input),
  );
  const remove = useCatalogWrite((id: string) => catalogApi.remove('spaces', id));

  return (
    <SettingsSection title={t('settings.tabs.spaces')} lead={t('settings.spaces.lead')}>
      <p className="-mt-2 mb-3 text-meta text-foreground-2">{t('settings.spaces.aiHint')}</p>
      <ul className="border-t">
        {spaces.map((space) => (
          <Row
            key={space.id}
            actions={
              <>
                <label className="flex items-center gap-1.5 text-meta whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={space.aiAllowed}
                    onChange={(e) => update.mutate({ id: space.id, aiAllowed: e.target.checked })}
                    aria-label={t('settings.spaces.aiAllowedFor', { name: spaceName(t, space) })}
                  />
                  {t('settings.spaces.aiAllowed')}
                </label>
                <Select
                  aria-label={t('settings.spaces.color')}
                  value={space.color ?? 'slate'}
                  onChange={(e) =>
                    update.mutate({ id: space.id, color: e.target.value as SpaceColor })
                  }
                  className="w-32"
                >
                  {SPACE_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {t(`settings.spaces.colors.${c}`)}
                    </option>
                  ))}
                </Select>
                <RemoveButton
                  label={t('common.removeNamed', { name: spaceName(t, space) })}
                  title={t('settings.spaces.removeTitle', { name: spaceName(t, space) })}
                  description={t('settings.spaces.removeBody')}
                  onConfirm={() => remove.mutate(space.id)}
                />
              </>
            }
          >
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: spaceColor(space.color) }}
            />
            <InlineText
              label={t('settings.spaces.name')}
              value={spaceName(t, space)}
              validate={(v) => (v.trim() ? null : t('validation.required'))}
              onSave={(value) => update.mutateAsync({ id: space.id, name: value })}
            />
            <span className="num text-meta text-muted-foreground">
              {t('organizations.people', { count: space.peopleCount })}
            </span>
          </Row>
        ))}
      </ul>
      <FormMessage tone="error">
        {(remove.isError && errorMessage(t, remove.error)) ||
          (update.isError && errorMessage(t, update.error))}
      </FormMessage>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (name.trim()) create.mutate({ name });
        }}
      >
        <Input
          aria-label={t('settings.spaces.new')}
          placeholder={t('settings.spaces.new')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!name.trim() || create.isPending}>
          {t('common.add')}
        </Button>
      </form>
    </SettingsSection>
  );
}

// Tags -------------------------------------------------------------------------------

export function TagsSettingsPage() {
  const { t } = useTranslation();
  const { data: tags = [] } = useQuery(tagsQuery);
  const [name, setName] = useState('');
  const create = useCatalogWrite(
    (input: { name: string }) => catalogApi.create('tags', input),
    () => setName(''),
  );
  const rename = useCatalogWrite(({ id, name }: { id: string; name: string }) =>
    catalogApi.update('tags', id, { name }),
  );
  const remove = useCatalogWrite((id: string) => catalogApi.remove('tags', id));

  return (
    <SettingsSection title={t('settings.tabs.tags')} lead={t('settings.tags.lead')}>
      {tags.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('settings.tags.empty')}</p>
      )}
      <ul className="border-t">
        {tags.map((tag) => (
          <Row
            key={tag.id}
            actions={
              <RemoveButton
                label={t('common.removeNamed', { name: tag.name })}
                title={t('settings.tags.removeTitle', { name: tag.name })}
                description={t('settings.tags.removeBody', { count: tag.peopleCount })}
                onConfirm={() => remove.mutate(tag.id)}
              />
            }
          >
            <span className="text-muted-foreground">#</span>
            <InlineText
              label={t('settings.tags.name')}
              value={tag.name}
              validate={(v) => (v.trim() ? null : t('validation.required'))}
              onSave={(value) => rename.mutateAsync({ id: tag.id, name: value })}
            />
            <span className="num text-meta text-muted-foreground">
              {t('organizations.people', { count: tag.peopleCount })}
            </span>
          </Row>
        ))}
      </ul>
      <FormMessage tone="error">
        {(create.isError && errorMessage(t, create.error)) ||
          (rename.isError && errorMessage(t, rename.error))}
      </FormMessage>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (name.trim()) create.mutate({ name });
        }}
      >
        <Input
          aria-label={t('settings.tags.new')}
          placeholder={t('settings.tags.new')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!name.trim() || create.isPending}>
          {t('common.add')}
        </Button>
      </form>
    </SettingsSection>
  );
}

// Relationship types ------------------------------------------------------------------

export function RelationshipTypesSettingsPage() {
  const { t } = useTranslation();
  const { data: types = [] } = useQuery(relationshipTypesQuery);
  const [form, setForm] = useState({ name: '', reverseName: '', symmetric: false });
  const create = useCatalogWrite(
    (input: typeof form) =>
      catalogApi.create('relationship-types', {
        name: input.name,
        symmetric: input.symmetric,
        ...(input.symmetric ? {} : { reverseName: input.reverseName }),
      }),
    () => setForm({ name: '', reverseName: '', symmetric: false }),
  );
  const update = useCatalogWrite(
    ({ id, ...input }: { id: string; name?: string; reverseName?: string }) =>
      catalogApi.update('relationship-types', id, input),
  );
  const remove = useCatalogWrite((id: string) => catalogApi.remove('relationship-types', id));

  return (
    <SettingsSection
      title={t('settings.tabs.relationshipTypes')}
      lead={t('settings.relationshipTypes.lead')}
    >
      <ul className="border-t">
        {types.map((type) => {
          const name = labelText(t, type);
          const reverse = labelText(t, { name: type.reverseName, nameKey: type.reverseNameKey });
          return (
            <Row
              key={type.id}
              actions={
                <RemoveButton
                  label={t('common.removeNamed', { name })}
                  title={t('settings.relationshipTypes.removeTitle', { name })}
                  description={t('settings.relationshipTypes.removeBody')}
                  onConfirm={() => remove.mutate(type.id)}
                />
              }
            >
              <InlineText
                label={t('settings.relationshipTypes.name')}
                value={name}
                validate={(v) => (v.trim() ? null : t('validation.required'))}
                onSave={(value) => update.mutateAsync({ id: type.id, name: value })}
              />
              {!type.symmetric && (
                <>
                  <span aria-hidden className="text-muted-foreground">
                    ↔
                  </span>
                  <InlineText
                    label={t('settings.relationshipTypes.reverseName')}
                    value={reverse}
                    validate={(v) => (v.trim() ? null : t('validation.required'))}
                    onSave={(value) => update.mutateAsync({ id: type.id, reverseName: value })}
                  />
                </>
              )}
              {type.symmetric && (
                <span className="text-meta text-muted-foreground">
                  {t('settings.relationshipTypes.symmetric')}
                </span>
              )}
            </Row>
          );
        })}
      </ul>
      <form
        className="mt-5 flex flex-col gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (form.name.trim() && (form.symmetric || form.reverseName.trim())) create.mutate(form);
        }}
      >
        <h3 className="text-sm font-semibold">{t('settings.relationshipTypes.new')}</h3>
        <div className="grid grid-cols-2 gap-2">
          <Input
            aria-label={t('settings.relationshipTypes.name')}
            placeholder={t('settings.relationshipTypes.namePlaceholder')}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          {!form.symmetric && (
            <Input
              aria-label={t('settings.relationshipTypes.reverseName')}
              placeholder={t('settings.relationshipTypes.reversePlaceholder')}
              value={form.reverseName}
              onChange={(e) => setForm((f) => ({ ...f, reverseName: e.target.value }))}
            />
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground-2">
          <input
            type="checkbox"
            checked={form.symmetric}
            onChange={(e) => setForm((f) => ({ ...f, symmetric: e.target.checked }))}
          />
          {t('settings.relationshipTypes.symmetricLabel')}
        </label>
        <FormMessage tone="error">{create.isError && errorMessage(t, create.error)}</FormMessage>
        <Button
          type="submit"
          variant="secondary"
          className="self-start"
          disabled={create.isPending}
        >
          {t('common.add')}
        </Button>
      </form>
    </SettingsSection>
  );
}

// Custom fields -----------------------------------------------------------------------

export function FieldsSettingsPage() {
  const { t } = useTranslation();
  const { data: definitions = [] } = useQuery(fieldDefinitionsQuery());
  const [form, setForm] = useState<{
    target: FieldDefinition['target'];
    label: string;
    type: FieldDefinition['type'];
    options: string;
  }>({
    target: 'person',
    label: '',
    type: 'text',
    options: '',
  });
  const splitOptions = (value: string) =>
    value
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  const create = useCatalogWrite(
    (input: typeof form) =>
      catalogApi.create('field-definitions', {
        target: input.target,
        label: input.label,
        type: input.type,
        ...(input.type === 'select' ? { options: splitOptions(input.options) } : {}),
      }),
    () => setForm((f) => ({ ...f, label: '', options: '' })),
  );
  const update = useCatalogWrite(
    ({ id, ...input }: { id: string; label?: string; options?: string[] }) =>
      catalogApi.update('field-definitions', id, input),
  );
  const remove = useCatalogWrite((id: string) => catalogApi.remove('field-definitions', id));

  return (
    <SettingsSection title={t('settings.tabs.fields')} lead={t('settings.fields.lead')}>
      {(['person', 'organization'] as const).map((target) => {
        const list = definitions.filter((d) => d.target === target);
        return (
          <div key={target} className="mb-5">
            <h3 className="mb-1 text-sm font-semibold">{t(`settings.fields.targets.${target}`)}</h3>
            {list.length === 0 && (
              <p className="border-t py-2 text-sm text-muted-foreground">
                {t('settings.fields.empty')}
              </p>
            )}
            <ul className="border-t">
              {list.map((d) => (
                <Row
                  key={d.id}
                  actions={
                    <RemoveButton
                      label={t('common.removeNamed', { name: d.label })}
                      title={t('settings.fields.removeTitle', { name: d.label })}
                      description={t('settings.fields.removeBody')}
                      onConfirm={() => remove.mutate(d.id)}
                    />
                  }
                >
                  <InlineText
                    label={t('settings.fields.label')}
                    value={d.label}
                    validate={(v) => (v.trim() ? null : t('validation.required'))}
                    onSave={(label) => update.mutateAsync({ id: d.id, label })}
                  />
                  <span className="text-meta text-muted-foreground">
                    {t(`settings.fields.types.${d.type}`)}
                  </span>
                  {d.type === 'select' && (
                    <InlineText
                      label={t('settings.fields.options')}
                      value={(d.options ?? []).join(', ')}
                      className="text-meta"
                      validate={(v) => (splitOptions(v).length ? null : t('validation.required'))}
                      onSave={(value) =>
                        update.mutateAsync({ id: d.id, options: splitOptions(value) })
                      }
                    />
                  )}
                </Row>
              ))}
            </ul>
          </div>
        );
      })}
      <form
        className="mt-2 flex flex-col gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (form.label.trim() && (form.type !== 'select' || splitOptions(form.options).length))
            create.mutate(form);
        }}
      >
        <h3 className="text-sm font-semibold">{t('settings.fields.new')}</h3>
        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label={t('settings.fields.target')}
            value={form.target}
            onChange={(e) => setForm((f) => ({ ...f, target: e.target.value as 'person' }))}
          >
            <option value="person">{t('settings.fields.targets.person')}</option>
            <option value="organization">{t('settings.fields.targets.organization')}</option>
          </Select>
          <Select
            aria-label={t('settings.fields.type')}
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'text' }))}
          >
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`settings.fields.types.${type}`)}
              </option>
            ))}
          </Select>
        </div>
        <FormField label={t('settings.fields.label')}>
          <Input
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
        </FormField>
        {form.type === 'select' && (
          <FormField label={t('settings.fields.options')} hint={t('settings.fields.optionsHint')}>
            <Input
              value={form.options}
              onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
            />
          </FormField>
        )}
        <FormMessage tone="error">{create.isError && errorMessage(t, create.error)}</FormMessage>
        <Button
          type="submit"
          variant="secondary"
          className="self-start"
          disabled={create.isPending}
        >
          {t('common.add')}
        </Button>
      </form>
    </SettingsSection>
  );
}
