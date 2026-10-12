import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { personDisplayName, type MergeField, type Person } from '@app/shared';
import { FormMessage } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { duplicateApi, personQuery, spacesQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { spaceName } from '@/lib/labels';

/** Full name without the nickname: what “Name” means when merging. */
const fullName = (p: Person) => personDisplayName({ ...p, nickname: null });

/** How much there is about a person: the richer one stays by default. */
const weight = (p: Person) =>
  (p.listed ? 100 : 0) +
  p.contactPoints.length +
  p.addresses.length +
  p.facts.length +
  p.relationships.length +
  p.affiliations.length +
  (p.lastContact ? 5 : 0);

interface Props {
  ids: [string, string];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Merge two people: choose who stays and, where both differ, which value. */
export function MergeDialog({ ids, open, onOpenChange }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: a } = useQuery({ ...personQuery(ids[0]), enabled: open });
  const { data: b } = useQuery({ ...personQuery(ids[1]), enabled: open });
  const { data: spaces = [] } = useQuery(spacesQuery);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [take, setTake] = useState<Set<MergeField>>(new Set());
  const merge = useWrite(duplicateApi.merge, {
    invalidate: [['people'], ['duplicates'], ['entries'], ['today'], ['organizations'], ['trash']],
    onSuccess: (person) => {
      onOpenChange(false);
      void navigate({ to: '/people/$personId', params: { personId: person.id } });
    },
  });

  const ready = a && b;
  const defaultKeep = ready ? (weight(b) > weight(a) ? b.id : a.id) : null;
  const keep = ready ? ((keepId ?? defaultKeep) === b.id ? b : a) : null;
  const other = ready ? (keep === a ? b : a) : null;

  const date = (value: string) => {
    const yearless = value.startsWith('--');
    const d = new Date(yearless ? `2000${value.slice(1)}T12:00:00Z` : `${value}T12:00:00Z`);
    return new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      day: 'numeric',
      month: 'long',
      ...(yearless ? {} : { year: 'numeric' }),
    }).format(d);
  };
  const space = (id: string) => {
    const s = spaces.find((x) => x.id === id);
    return s ? spaceName(t, s) : id;
  };
  // `--10-24` and `1985-10-24` are the same birthday: no question; the year wins.
  const monthDay = (value: string | null | undefined) => value?.slice(-5) ?? null;
  const sameBirthday = !!keep?.birthday && monthDay(keep.birthday) === monthDay(other?.birthday);
  const birthdayRefines =
    sameBirthday && !!keep?.birthday?.startsWith('--') && !other?.birthday?.startsWith('--');
  /** Fields where both have a different value: the user picks one. */
  const choices: { field: MergeField; label: string; keep: string; other: string }[] = [];
  if (keep && other) {
    const add = (field: MergeField, label: string, k: string | null, o: string | null) => {
      if (k && o && k !== o) choices.push({ field, label, keep: k, other: o });
    };
    add('name', t('merge.fields.name'), fullName(keep), fullName(other));
    add('nickname', t('person.name.nickname'), keep.nickname, other.nickname);
    add('maidenName', t('person.name.maidenName'), keep.maidenName, other.maidenName);
    add('pronouns', t('person.name.pronouns'), keep.pronouns, other.pronouns);
    if (!sameBirthday) {
      add(
        'birthday',
        t('person.birthday'),
        keep.birthday && date(keep.birthday),
        other.birthday && date(other.birthday),
      );
    }
    add('summary', t('merge.fields.summary'), keep.summary, other.summary);
    add('metWhere', t('merge.fields.metWhere'), keep.metWhere, other.metWhere);
    add('metWhen', t('merge.fields.metWhen'), keep.metWhen, other.metWhen);
    add(
      'metThrough',
      t('merge.fields.metThrough'),
      keep.metThrough?.displayName ?? null,
      other.metThrough?.displayName ?? null,
    );
    add(
      'contactEveryDays',
      t('person.rhythm.label'),
      keep.contactEveryDays ? t('merge.days', { count: keep.contactEveryDays }) : null,
      other.contactEveryDays ? t('merge.days', { count: other.contactEveryDays }) : null,
    );
    if (keep.photoUrl && other.photoUrl && keep.photoUrl !== other.photoUrl) {
      choices.push({
        field: 'photo',
        label: t('merge.fields.photo'),
        keep: keep.photoUrl,
        other: other.photoUrl,
      });
    }
    add('space', t('spaces.label'), space(keep.spaceId), space(other.spaceId));
  }

  const toggle = (field: MergeField, fromOther: boolean) => {
    const next = new Set(take);
    if (fromOther) next.add(field);
    else next.delete(field);
    setTake(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('merge.title')} className="max-h-[80vh] overflow-y-auto sm:max-w-xl">
        <p className="mb-4 text-sm text-foreground-2">{t('merge.lead')}</p>
        {!keep || !other ? (
          <p className="text-sm text-foreground-2">{t('common.loading')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-1.5 text-sm font-semibold">{t('merge.keep')}</div>
              <SegmentedControl
                label={t('merge.keep')}
                value={keep.id}
                onChange={(id) => {
                  setKeepId(id);
                  setTake(new Set());
                }}
                options={[a!, b!].map((p) => ({ value: p.id, label: p.displayName }))}
              />
            </div>
            {choices.length > 0 && (
              <fieldset>
                <legend className="text-sm font-semibold">{t('merge.choose')}</legend>
                <ul className="mt-1">
                  {choices.map((c) => (
                    <li key={c.field} className="border-b py-2">
                      <div className="text-meta text-foreground-2">{c.label}</div>
                      {[false, true].map((fromOther) => {
                        const value = fromOther ? c.other : c.keep;
                        return (
                          <label
                            key={String(fromOther)}
                            className="mt-1 flex items-center gap-2 text-sm"
                          >
                            <input
                              type="radio"
                              name={`merge-${c.field}`}
                              checked={take.has(c.field) === fromOther}
                              onChange={() => toggle(c.field, fromOther)}
                            />
                            {c.field === 'photo' ? (
                              <img
                                src={value}
                                alt=""
                                className="size-10 rounded-full object-cover"
                              />
                            ) : (
                              <span className="break-words">{value}</span>
                            )}
                          </label>
                        );
                      })}
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            <p className="text-sm text-foreground-2">
              {t('merge.combined', { name: other.displayName })}
            </p>
            <FormMessage tone="error">{merge.isError && errorMessage(t, merge.error)}</FormMessage>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!keep || !other || merge.isPending}
            onClick={() =>
              keep &&
              other &&
              merge.mutate({
                keepId: keep.id,
                mergeId: other.id,
                take: [...take, ...(birthdayRefines ? (['birthday'] as const) : [])],
              })
            }
          >
            {t('merge.submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
