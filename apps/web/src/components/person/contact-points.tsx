import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CONTACT_POINT_KINDS, type ContactPoint, type ContactPointKind } from '@app/shared';
import { FormMessage } from '@/components/form-field';
import { EditButton, RemoveButton } from '@/components/row-actions';
import { EmptyRow, SideRow, SideSection } from '@/components/side-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { peopleApi, useWrite } from '@/lib/data';
import { contactHref } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

const PRESET_LABELS = ['mobile', 'work', 'home'] as const;
const CUSTOM = '__custom';

function ContactPointForm({
  initial,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  initial?: ContactPoint;
  onSubmit: (input: {
    kind: ContactPointKind;
    label: string | null;
    value: string;
    isPrimary: boolean;
  }) => void;
  onCancel: () => void;
  pending: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ContactPointKind>(initial?.kind ?? 'phone');
  // A native select instead of a datalist: Safari on the iPhone shows no list for those.
  // An existing label that is no preset (e.g. imported) stays selectable as it is.
  const translated = PRESET_LABELS.map((key) => t(`contact.labels.${key}`));
  const presets =
    initial?.label && !translated.includes(initial.label)
      ? [...translated, initial.label]
      : translated;
  const [label, setLabel] = useState(initial?.label ?? '');
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState(initial?.value ?? '');
  const [isPrimary, setPrimary] = useState(initial?.isPrimary ?? false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim())
      onSubmit({ kind, label: label.trim() || null, value: value.trim(), isPrimary });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-b py-3">
      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label={t('contact.kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as ContactPointKind)}
        >
          {CONTACT_POINT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`contact.kinds.${k}`)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('contact.label')}
          value={custom ? CUSTOM : label}
          onChange={(e) => {
            const chosen = e.target.value;
            setCustom(chosen === CUSTOM);
            setLabel(chosen === CUSTOM ? '' : chosen);
          }}
        >
          <option value="">{t('contact.noLabel')}</option>
          {presets.map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
          <option value={CUSTOM}>{t('contact.customLabel')}</option>
        </Select>
      </div>
      {custom && (
        <Input
          aria-label={t('contact.ownLabel')}
          placeholder={t('contact.labelPlaceholder')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
      )}
      <Input
        aria-label={t('contact.value')}
        placeholder={t(`contact.placeholders.${kind}`)}
        type={kind === 'email' ? 'email' : kind === 'phone' ? 'tel' : 'text'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        required
      />
      <label className="flex items-center gap-2 text-sm text-foreground-2">
        <input type="checkbox" checked={isPrimary} onChange={(e) => setPrimary(e.target.checked)} />
        {t('contact.primary')}
      </label>
      <FormMessage tone="error">{error ? errorMessage(t, error) : null}</FormMessage>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {t('common.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

export function ContactPointsSection({
  personId,
  points,
}: {
  personId: string;
  points: ContactPoint[];
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const add = useWrite((input: unknown) => peopleApi.addItem(personId, 'contact-points', input), {
    onSuccess: () => setAdding(false),
  });
  const update = useWrite(
    ({ id, input }: { id: string; input: unknown }) =>
      peopleApi.updateItem(personId, 'contact-points', id, input),
    { onSuccess: () => setEditing(null) },
  );
  const remove = useWrite((id: string) => peopleApi.removeItem(personId, 'contact-points', id));

  return (
    <SideSection
      title={t('contact.title')}
      addLabel={t('contact.add')}
      onAdd={() => setAdding(true)}
    >
      {points.length === 0 && !adding && <EmptyRow>{t('contact.empty')}</EmptyRow>}
      {points.map((point) => {
        if (editing === point.id) {
          return (
            <ContactPointForm
              key={point.id}
              initial={point}
              pending={update.isPending}
              error={update.error}
              onCancel={() => setEditing(null)}
              onSubmit={(input) => update.mutate({ id: point.id, input })}
            />
          );
        }
        const href = contactHref(point);
        const label = point.label ?? t(`contact.kinds.${point.kind}`);
        return (
          <SideRow
            key={point.id}
            actions={
              <>
                <EditButton
                  label={t('common.editNamed', { name: point.value })}
                  onClick={() => setEditing(point.id)}
                />
                <RemoveButton
                  label={t('common.removeNamed', { name: point.value })}
                  title={t('contact.removeTitle', { value: point.value })}
                  onConfirm={() => remove.mutate(point.id)}
                />
              </>
            }
          >
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3">
              <span className="text-meta text-muted-foreground">
                {label}
                {point.isPrimary && ' ★'}
              </span>
              {href ? (
                <a
                  href={href}
                  className="num break-all underline"
                  target={point.kind === 'url' ? '_blank' : undefined}
                  rel="noreferrer"
                >
                  {point.value}
                </a>
              ) : (
                <span className="num break-all">{point.value}</span>
              )}
            </div>
          </SideRow>
        );
      })}
      {adding && (
        <ContactPointForm
          pending={add.isPending}
          error={add.error}
          onCancel={() => setAdding(false)}
          onSubmit={(input) => add.mutate(input)}
        />
      )}
    </SideSection>
  );
}
