import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { GitMerge } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DuplicatePair, DuplicatePerson } from '@app/shared';
import { Avatar } from '@/components/avatar';
import { FormMessage } from '@/components/form-field';
import { MergeDialog } from '@/components/merge-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { duplicateApi, duplicatesQuery, spacesQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { spaceName } from '@/lib/labels';

function Side({ person }: { person: DuplicatePerson }) {
  const { t } = useTranslation();
  const { data: spaces = [] } = useQuery(spacesQuery);
  const space = spaces.find((s) => s.id === person.spaceId);
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Avatar initials={person.initials} photoUrl={person.photoUrl} />
      <div className="min-w-0 text-sm">
        <Link
          to="/people/$personId"
          params={{ personId: person.id }}
          className="font-semibold break-words"
        >
          {person.displayName}
        </Link>
        <div className="text-foreground-2">
          {[
            space && spaceName(t, space),
            !person.listed && t('indirect.label'),
            person.archivedAt && t('person.archived'),
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
        {person.details && <div className="truncate text-foreground-2">{person.details}</div>}
        {person.summary && <div className="truncate text-foreground-2">{person.summary}</div>}
      </div>
    </div>
  );
}

function PairRow({ pair, onMerge }: { pair: DuplicatePair; onMerge: () => void }) {
  const { t } = useTranslation();
  const dismiss = useWrite(() => duplicateApi.dismiss([pair.a.id, pair.b.id]), {
    invalidate: [['duplicates']],
  });
  return (
    <li className="border-b py-3" aria-label={`${pair.a.displayName} / ${pair.b.displayName}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Side person={pair.a} />
        <Side person={pair.b} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-meta text-signal">
          {pair.reasons.map((r) => t(`import.reasons.${r}`)).join(', ')}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate(undefined)}
          >
            {t('duplicates.dismiss')}
          </Button>
          <Button size="sm" variant="secondary" onClick={onMerge}>
            <GitMerge aria-hidden />
            {t('duplicates.merge')}
          </Button>
        </div>
      </div>
      <FormMessage tone="error">{dismiss.isError && errorMessage(t, dismiss.error)}</FormMessage>
    </li>
  );
}

/** Likely duplicates (same email, phone or name) with merge and “not the same”. */
export function DuplicatesPage() {
  const { t } = useTranslation();
  const { data: pairs } = useQuery(duplicatesQuery);
  const [merging, setMerging] = useState<[string, string] | null>(null);
  return (
    <>
      <PageHeader title={t('duplicates.title')} />
      <p className="mt-3 max-w-xl text-sm text-foreground-2">{t('duplicates.lead')}</p>
      {!pairs ? (
        <p className="mt-6 text-sm text-foreground-2">{t('common.loading')}</p>
      ) : pairs.length === 0 ? (
        <p className="mt-6 text-sm text-foreground-2">{t('duplicates.none')}</p>
      ) : (
        <ul className="mt-4 max-w-3xl" aria-label={t('duplicates.title')}>
          {pairs.map((pair) => (
            <PairRow
              key={`${pair.a.id}|${pair.b.id}`}
              pair={pair}
              onMerge={() => setMerging([pair.a.id, pair.b.id])}
            />
          ))}
        </ul>
      )}
      {merging && (
        <MergeDialog ids={merging} open onOpenChange={(open) => !open && setMerging(null)} />
      )}
    </>
  );
}
