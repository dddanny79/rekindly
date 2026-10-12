import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TrashItem } from '@app/shared';
import { FormMessage } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { trashApi, trashQuery, useWrite } from '@/lib/data';
import { fromDateOnly } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { ORGANIZATION_KINDS } from '@/lib/format';
import { labelText } from '@/lib/labels';

function useItemText() {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  return (item: TrashItem) => {
    const label =
      labelText(t, item.label) ||
      (item.entry
        ? `${t(`timeline.kinds.${item.entry.kind}`)} · ${date.format(new Date(item.entry.occurredAt))}`
        : t('trash.untitled'));
    let detail = item.detail;
    if (item.kind === 'reminder' && detail) detail = date.format(fromDateOnly(detail));
    if (item.kind === 'fieldDefinition' && (detail === 'person' || detail === 'organization'))
      detail = t(`settings.fields.targets.${detail}`);
    if (item.kind === 'organization' && detail)
      detail = (ORGANIZATION_KINDS as readonly string[]).includes(detail)
        ? t(`organizations.kinds.${detail as (typeof ORGANIZATION_KINDS)[number]}`)
        : detail;
    return { label, detail };
  };
}

function OwnerLink({ owner }: { owner: NonNullable<TrashItem['owner']> }) {
  const link =
    owner.type === 'person'
      ? ({ to: '/people/$personId', params: { personId: owner.id } } as const)
      : ({ to: '/organizations/$organizationId', params: { organizationId: owner.id } } as const);
  return (
    <Trans
      i18nKey="trash.of"
      values={{ name: owner.name }}
      components={[<Link key="owner" {...link} className="underline" />]}
    />
  );
}

function TrashRow({ item }: { item: TrashItem }) {
  const { t, i18n } = useTranslation();
  const text = useItemText()(item);
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  const restore = useWrite(() => trashApi.restore(item.kind, item.id));
  const purge = useWrite(() => trashApi.purge(item.kind, item.id));
  const error = restore.error ?? purge.error;

  return (
    <li className="flex flex-col gap-2 border-b py-2.5 md:flex-row md:items-start md:gap-6">
      <div className="min-w-0 flex-1">
        <div className="kicker text-muted-foreground">{t(`trash.kinds.${item.kind}`)}</div>
        <div className="font-semibold break-words">{text.label}</div>
        {(text.detail || item.owner) && (
          <div className="text-meta break-words text-foreground-2">
            {text.detail}
            {text.detail && item.owner && ' · '}
            {item.owner && <OwnerLink owner={item.owner} />}
          </div>
        )}
        <FormMessage tone="error">{error && errorMessage(t, error)}</FormMessage>
      </div>
      <div className="num shrink-0 text-meta text-muted-foreground md:w-44 md:text-right">
        <div>{t('trash.deleted', { date: date.format(new Date(item.deletedAt)) })}</div>
        <div>{t('trash.purgeAt', { date: date.format(new Date(item.purgeAt)) })}</div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => restore.mutate(undefined)}
          disabled={restore.isPending || purge.isPending}
          aria-label={t('trash.restoreNamed', { name: text.label })}
        >
          <RotateCcw aria-hidden />
          {t('trash.restore')}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('trash.purgeNamed', { name: text.label })}
              disabled={restore.isPending || purge.isPending}
            >
              <Trash2 aria-hidden />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('trash.purgeTitle', { name: text.label })}</AlertDialogTitle>
              <AlertDialogDescription>
                {item.kind === 'person' ? t('trash.purgePersonBody') : t('trash.purgeBody')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="secondary">{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => purge.mutate(undefined)}>
                {t('trash.purge')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

/** Everything deleted in the last 30 days: restore it, or delete it for good. */
export function TrashPage(): ReactElement {
  const { t } = useTranslation();
  const { data: items } = useQuery(trashQuery);
  const [kept, setKept] = useState(0);
  const empty = useWrite(trashApi.empty, { onSuccess: (result) => setKept(result.kept) });

  return (
    <>
      <PageHeader
        title={t('nav.trash')}
        lead={t('trash.lead')}
        actions={
          items && items.length > 0 ? (
            <div className="flex items-center gap-3">
              <span className="num text-meta text-muted-foreground" aria-live="polite">
                {t('trash.count', { count: items.length })}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="secondary" disabled={empty.isPending}>
                    <Trash2 aria-hidden />
                    {t('trash.emptyAll')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('trash.emptyTitle', { count: items.length })}
                    </AlertDialogTitle>
                    <AlertDialogDescription>{t('trash.purgeBody')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel variant="secondary">{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => empty.mutate(undefined)}
                    >
                      {t('trash.emptyAll')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : undefined
        }
      />

      <div className="mt-2 max-w-4xl">
        <FormMessage tone="error">{empty.isError && errorMessage(t, empty.error)}</FormMessage>
        {kept > 0 && (
          <p className="mt-3 text-sm text-foreground-2">{t('trash.kept', { count: kept })}</p>
        )}
        {!items ? (
          <p className="mt-4 text-muted-foreground">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="mt-6 font-serif text-read">{t('trash.empty')}</p>
        ) : (
          <ul className="mt-2">
            {items.map((item) => (
              <TrashRow key={`${item.kind}:${item.id}`} item={item} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
