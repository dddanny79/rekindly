import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PERSON_DATE_KINDS, type PersonDate, type PersonDateKind } from '@app/shared';
import { FormMessage } from '@/components/form-field';
import { InlineText } from '@/components/inline-edit';
import { DetailRow } from '@/components/person/detail-row';
import { RemoveButton } from '@/components/row-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { personDatesApi, useWrite } from '@/lib/data';
import { birthdayInput, formatBirthday, nextBirthday, parseBirthday } from '@/lib/dates';
import { useDayText } from '@/lib/day-text';
import { errorMessage } from '@/lib/errors';

const DATE_KEYS = [['people'], ['today'], ['trash']];

function DateRow({ personId, day }: { personId: string; day: PersonDate }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const text = useDayText();
  const label = text.label(day);
  const next = nextBirthday(day.date);
  const years = text.years(day.kind, next.turns);
  const update = useWrite((date: string) => personDatesApi.update(personId, day.id, { date }), {
    invalidate: DATE_KEYS,
  });
  const remove = useWrite(() => personDatesApi.remove(personId, day.id), {
    invalidate: DATE_KEYS,
  });

  return (
    <DetailRow label={label}>
      <div className="group flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <InlineText
            label={label}
            value={day.date}
            editValue={birthdayInput(day.date)}
            display={
              <>
                {formatBirthday(day.date, locale)}
                <span className="num block text-meta text-muted-foreground">
                  {t('person.birthdayIn', { count: next.days })}
                  {years && ` · ${years}`}
                </span>
              </>
            }
            validate={(input) => (parseBirthday(input) ? null : t('person.birthdayInvalid'))}
            onSave={(input) => update.mutateAsync(parseBirthday(input)!)}
          />
        </div>
        <div className="md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <RemoveButton
            label={t('common.removeNamed', { name: label })}
            title={t('personDates.removeTitle')}
            description={`${label} · ${formatBirthday(day.date, locale)}`}
            onConfirm={() => remove.mutate(undefined)}
          />
        </div>
      </div>
    </DetailRow>
  );
}

function AddDate({ personId, onDone }: { personId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<PersonDateKind>('wedding');
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [invalid, setInvalid] = useState(false);
  const add = useWrite(
    (input: { kind: PersonDateKind; label: string | null; date: string }) =>
      personDatesApi.create(personId, input),
    { invalidate: DATE_KEYS, onSuccess: onDone },
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseBirthday(date);
    setInvalid(!parsed);
    if (!parsed || (kind === 'custom' && !label.trim())) return;
    add.mutate({ kind, label: kind === 'custom' ? label.trim() : null, date: parsed });
  }

  return (
    <form
      onSubmit={submit}
      aria-label={t('personDates.addTitle')}
      className="flex flex-col gap-2 border-b py-3"
    >
      <Select
        aria-label={t('personDates.kind')}
        value={kind}
        onChange={(e) => setKind(e.target.value as PersonDateKind)}
      >
        {PERSON_DATE_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`personDates.kinds.${k}`)}
          </option>
        ))}
      </Select>
      {kind === 'custom' && (
        <Input
          aria-label={t('personDates.label')}
          placeholder={t('personDates.labelPlaceholder')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          required
        />
      )}
      <Input
        aria-label={t('personDates.date')}
        placeholder={t('person.birthdayPlaceholder')}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-invalid={invalid || undefined}
        autoFocus
        required
      />
      <FormMessage tone="error">
        {(invalid && t('person.birthdayInvalid')) || (add.isError && errorMessage(t, add.error))}
      </FormMessage>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={add.isPending}>
          {t('common.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Wedding anniversaries, memorial days and other recurring days, under the birthday. */
export function PersonDateRows({ personId, dates }: { personId: string; dates: PersonDate[] }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  return (
    <>
      {dates.map((day) => (
        <DateRow key={day.id} personId={personId} day={day} />
      ))}
      {adding ? (
        <AddDate personId={personId} onDone={() => setAdding(false)} />
      ) : (
        <div className="border-b py-1">
          <Button size="xs" variant="ghost" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t('personDates.add')}
          </Button>
        </div>
      )}
    </>
  );
}
