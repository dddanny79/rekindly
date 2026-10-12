import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Person } from '@app/shared';
import { Combobox } from '@/components/combobox';
import { InlineText } from '@/components/inline-edit';
import { SideSection } from '@/components/side-section';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { peopleApi, peopleQuery, useWrite } from '@/lib/data';
import {
  birthdayInput,
  formatBirthday,
  formatPartialDate,
  partialDateInput,
  nextBirthday,
  parseBirthday,
  parsePartialDate,
} from '@/lib/dates';
import { spaceName } from '@/lib/labels';
import { useSelectedSpace } from '@/lib/space-selection';

const RHYTHMS = [30, 90, 180, 365] as const;

/** Off, monthly, quarterly, half-yearly, yearly or a custom number of days. */
function RhythmInput({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (days: number | null) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const preset = value === null ? '' : RHYTHMS.includes(value as never) ? String(value) : 'custom';
  const [custom, setCustom] = useState(preset === 'custom');
  const selected = custom ? 'custom' : preset;

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        aria-label={t('person.rhythm.label')}
        value={selected}
        onChange={(e) => {
          const next = e.target.value;
          setCustom(next === 'custom');
          if (next !== 'custom') void onSave(next ? Number(next) : null);
        }}
      >
        <option value="">{t('person.rhythm.none')}</option>
        {RHYTHMS.map((days) => (
          <option key={days} value={days}>
            {t(`person.rhythm.d${days}`)}
          </option>
        ))}
        <option value="custom">{t('person.rhythm.customOption')}</option>
      </Select>
      {selected === 'custom' && (
        <InlineText
          label={t('person.rhythm.days')}
          value={value && preset === 'custom' ? String(value) : null}
          display={value ? t('person.rhythm.custom', { count: value }) : undefined}
          placeholder={t('person.rhythm.daysPlaceholder')}
          validate={(input) => {
            const n = Number(input);
            return Number.isInteger(n) && n >= 1 && n <= 3650
              ? null
              : t('person.rhythm.daysInvalid');
          }}
          onSave={(input) => onSave(Number(input))}
        />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-x-3 border-b py-1.5">
      <span className="text-meta text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function usePersonUpdate(personId: string) {
  return useWrite((patch: Record<string, unknown>) => peopleApi.update(personId, patch));
}

export function DetailsSection({ person }: { person: Person }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const { spaces } = useSelectedSpace();
  const update = usePersonUpdate(person.id);
  const upcoming = person.birthday ? nextBirthday(person.birthday) : null;

  return (
    <SideSection title={t('person.details')}>
      <Row label={t('person.birthday')}>
        <InlineText
          label={t('person.birthday')}
          value={person.birthday}
          editValue={birthdayInput(person.birthday)}
          display={
            person.birthday ? (
              <>
                {formatBirthday(person.birthday, locale)}
                {upcoming && (
                  <span className="num block text-meta text-muted-foreground">
                    {t('person.birthdayIn', { count: upcoming.days })}
                    {upcoming.turns !== null && ` · ${t('person.turns', { age: upcoming.turns })}`}
                  </span>
                )}
              </>
            ) : undefined
          }
          placeholder={t('person.birthdayPlaceholder')}
          validate={(input) =>
            parseBirthday(input) === undefined ? t('person.birthdayInvalid') : null
          }
          onSave={(input) => update.mutateAsync({ birthday: parseBirthday(input) })}
        />
      </Row>
      <Row label={t('person.name.pronouns')}>
        <InlineText
          label={t('person.name.pronouns')}
          value={person.pronouns}
          onSave={(pronouns) => update.mutateAsync({ pronouns })}
        />
      </Row>
      <Row label={t('person.rhythm.label')}>
        <RhythmInput
          value={person.contactEveryDays}
          onSave={(contactEveryDays) => update.mutateAsync({ contactEveryDays })}
        />
      </Row>
      {spaces.length > 1 && (
        <Row label={t('spaces.label')}>
          <Select
            aria-label={t('spaces.label')}
            value={person.spaceId}
            onChange={(e) => update.mutate({ spaceId: e.target.value })}
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {spaceName(t, s)}
              </option>
            ))}
          </Select>
        </Row>
      )}
    </SideSection>
  );
}

export function MetSection({ person }: { person: Person }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const update = usePersonUpdate(person.id);
  const { data: people = [] } = useQuery(peopleQuery({}));

  return (
    <SideSection title={t('person.met.title')}>
      <Row label={t('person.met.where')}>
        <InlineText
          label={t('person.met.where')}
          value={person.metWhere}
          onSave={(metWhere) => update.mutateAsync({ metWhere })}
        />
      </Row>
      <Row label={t('person.met.when')}>
        <InlineText
          label={t('person.met.when')}
          value={person.metWhen}
          editValue={partialDateInput(person.metWhen)}
          display={person.metWhen ? formatPartialDate(person.metWhen, locale) : undefined}
          placeholder={t('person.met.whenPlaceholder')}
          validate={(input) =>
            parsePartialDate(input) === undefined ? t('affiliation.dateHint') : null
          }
          onSave={(input) => update.mutateAsync({ metWhen: parsePartialDate(input) })}
        />
      </Row>
      <Row label={t('person.met.through')}>
        {person.metThrough ? (
          <div className="flex items-center justify-between gap-2">
            <Link
              to="/people/$personId"
              params={{ personId: person.metThrough.id }}
              className="truncate underline"
            >
              {person.metThrough.displayName}
            </Link>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={t('common.removeNamed', { name: person.metThrough.displayName })}
              onClick={() => update.mutate({ metThroughPersonId: null })}
            >
              <X aria-hidden />
            </Button>
          </div>
        ) : (
          <Combobox
            label={t('person.met.through')}
            placeholder={t('common.choose')}
            options={people
              .filter((p) => p.id !== person.id)
              .map((p) => ({ value: p.id, label: p.displayName }))}
            onSelect={(o) => update.mutate({ metThroughPersonId: o.value })}
          />
        )}
      </Row>
    </SideSection>
  );
}
