import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CloudDownload, Undo2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CSV_FIELDS,
  type ContactImport,
  type ContactImportPreview,
  type CsvMapping,
  type ImportAction,
  type ImportPreviewContact,
} from '@app/shared';
import { FormField, FormMessage } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { SettingsSection } from '@/components/settings-section';
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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { contactImportApi, contactImportsQuery, spacesQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { spaceName } from '@/lib/labels';

type Filter = 'all' | 'new' | 'duplicates';
const PAGE = 100;

function useDateTime() {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (iso: string) => format.format(new Date(iso));
}

/** Which CSV column holds what; changing it reads the file again. */
function ColumnMapping({
  csv,
  onChange,
}: {
  csv: NonNullable<ContactImportPreview['csv']>;
  onChange: (mapping: CsvMapping) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold">{t('import.mapping.title')}</h3>
      <p className="text-meta text-foreground-2">
        {t('import.mapping.lead', { template: t(`import.templates.${csv.template}`) })}
      </p>
      <ul className="mt-2">
        {csv.headers.map((header, i) => {
          const column = csv.mapping[i] ?? null;
          const sample = csv.samples.map((row) => row[i]).find((v) => v?.trim());
          return (
            <li
              key={i}
              className="grid grid-cols-1 items-center gap-1 border-b py-1.5 sm:grid-cols-[1fr_12rem]"
            >
              <div className="min-w-0 text-sm">
                <span className="font-semibold break-words">{header || '–'}</span>
                {sample && (
                  <span className="block truncate text-foreground-2" title={sample}>
                    {sample}
                  </span>
                )}
              </div>
              <Select
                aria-label={t('import.mapping.field', { column: header })}
                value={column?.field ?? ''}
                onChange={(e) => {
                  const field = e.target.value as (typeof CSV_FIELDS)[number] | '';
                  const next = [...csv.mapping];
                  next[i] = field ? { ...column, field } : null;
                  onChange(next);
                }}
              >
                <option value="">{t('import.fields.ignore')}</option>
                {CSV_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {t(`import.fields.${field}`)}
                  </option>
                ))}
              </Select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Monica: fetch the account through its API (address + personal access token). */
function MonicaFetch({ onFile }: { onFile: (file: File) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const fetchMonica = useWrite(() => contactImportApi.fetchMonica(url, token), {
    onSuccess: (file) => {
      setToken('');
      onFile(file);
    },
  });
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOpen(true)}>
        <CloudDownload aria-hidden />
        {t('import.monica.open')}
      </Button>
    );
  }
  return (
    <form
      className="mt-4 border-l-2 border-border pl-3"
      aria-label={t('import.monica.title')}
      onSubmit={(e) => {
        e.preventDefault();
        fetchMonica.mutate(undefined);
      }}
    >
      <h3 className="text-sm font-semibold">{t('import.monica.title')}</h3>
      <p className="text-meta text-foreground-2">{t('import.monica.lead')}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <FormField label={t('import.monica.url')}>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://app.monicahq.com"
            autoComplete="off"
          />
        </FormField>
        <FormField label={t('import.monica.token')}>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </FormField>
      </div>
      <FormMessage tone="error">
        {fetchMonica.isError && errorMessage(t, fetchMonica.error)}
      </FormMessage>
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        className="mt-2"
        disabled={!url.trim() || !token.trim() || fetchMonica.isPending}
      >
        {fetchMonica.isPending ? t('import.monica.fetching') : t('import.monica.fetch')}
      </Button>
    </form>
  );
}

function ContactRow({
  contact,
  action,
  onAction,
}: {
  contact: ImportPreviewContact;
  action: ImportAction;
  onAction: (action: ImportAction) => void;
}) {
  const { t } = useTranslation();
  const match = contact.match;
  const reasons = match?.reasons.map((r) => t(`import.reasons.${r}`)).join(', ');
  return (
    <li className="grid grid-cols-1 gap-1 border-b py-2 sm:grid-cols-[1fr_12rem] sm:items-center">
      <div className="min-w-0 text-sm">
        <div className="font-semibold">
          {contact.displayName}
          {contact.kind === 'organization' && (
            <span className="ml-2 text-meta font-normal text-foreground-2">
              {t('import.organization')}
            </span>
          )}
          {contact.indirect && (
            <span className="ml-2 text-meta font-normal text-foreground-2">
              {t('import.indirect')}
            </span>
          )}
        </div>
        {contact.details && <div className="truncate text-foreground-2">{contact.details}</div>}
        {match && (
          <div className="text-signal">
            {match.fileIndex !== null
              ? t('import.matchFile', { name: match.displayName, reasons })
              : t('import.match', { name: match.displayName, reasons })}
          </div>
        )}
      </div>
      <Select
        aria-label={t('import.action.label', { name: contact.displayName })}
        value={action}
        onChange={(e) => onAction(e.target.value as ImportAction)}
      >
        <option value="create">{t('import.action.create')}</option>
        <option value="skip">{t('import.action.skip')}</option>
        {match?.personId && (
          <option value="merge">{t('import.action.merge', { name: match.displayName })}</option>
        )}
      </Select>
    </li>
  );
}

function ImportHistory() {
  const { t } = useTranslation();
  const when = useDateTime();
  const { data: imports = [] } = useQuery(contactImportsQuery);
  const { data: spaces = [] } = useQuery(spacesQuery);
  const undo = useWrite(contactImportApi.undo, {
    invalidate: [
      ['contact-imports'],
      ['people'],
      ['organizations'],
      ['today'],
      ['trash'],
      ['tags'],
    ],
  });
  return (
    <SettingsSection title={t('import.history')}>
      {imports.length === 0 ? (
        <p className="text-sm text-foreground-2">{t('import.historyEmpty')}</p>
      ) : (
        <ul>
          {imports.map((item) => {
            const space = spaces.find((s) => s.id === item.spaceId);
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
              >
                <div className="min-w-0 text-sm">
                  <div className="font-semibold break-all">
                    {item.fileName ?? t(`import.formats.${item.format}`)}
                  </div>
                  <div className="text-foreground-2">
                    <span className="num">{when(item.createdAt)}</span>
                    {space && ` · ${spaceName(t, space)}`} ·{' '}
                    {t('import.historyLine', {
                      created: item.created,
                      merged: item.merged,
                      skipped: item.skipped,
                    })}
                  </div>
                  {item.undoneAt && (
                    <div className="text-foreground-2">
                      {t('import.undone', { date: when(item.undoneAt) })}
                    </div>
                  )}
                </div>
                {!item.undoneAt && <UndoButton item={item} onUndo={() => undo.mutate(item.id)} />}
              </li>
            );
          })}
        </ul>
      )}
      <FormMessage tone="error">{undo.isError && errorMessage(t, undo.error)}</FormMessage>
    </SettingsSection>
  );
}

function UndoButton({ item, onUndo }: { item: ContactImport; onUndo: () => void }) {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Undo2 aria-hidden />
          {t('import.undo')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('import.undoTitle', { name: item.fileName ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t('import.undoBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary">{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onUndo}>
            {t('import.undo')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Settings › Import: vCard or CSV → preview with duplicates → import; undoable. */
export function ImportSettingsPage() {
  const { t } = useTranslation();
  const when = useDateTime();
  const { data: spaces = [] } = useQuery(spacesQuery);
  const [file, setFile] = useState<File | null>(null);
  const [spaceId, setSpaceId] = useState('');
  const [mapping, setMapping] = useState<CsvMapping | undefined>(undefined);
  const [actions, setActions] = useState<Record<number, ImportAction>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const [result, setResult] = useState<ContactImport | null>(null);
  // A new key empties the file input after an import.
  const [inputKey, setInputKey] = useState(0);
  const targetSpace = spaceId || spaces[0]?.id || '';

  const preview = useQuery({
    queryKey: ['contact-import-preview', file?.name, file?.size, file?.lastModified, mapping],
    queryFn: () => contactImportApi.preview(file!, mapping),
    enabled: !!file,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const contacts = useMemo(() => preview.data?.contacts ?? [], [preview.data]);
  const actionOf = (c: ImportPreviewContact) => actions[c.index] ?? c.action;
  const counts = { create: 0, merge: 0, skip: 0 };
  for (const c of contacts) counts[actionOf(c)]++;
  const visible = contacts.filter((c) =>
    filter === 'new' ? !c.match : filter === 'duplicates' ? !!c.match : true,
  );

  const run = useWrite(
    () =>
      contactImportApi.run(file!, {
        spaceId: targetSpace,
        mapping,
        actions,
      }),
    {
      invalidate: [['contact-imports'], ['people'], ['organizations'], ['today'], ['tags']],
      onSuccess: (done) => {
        setResult(done);
        setFile(null);
        setInputKey((k) => k + 1);
        setMapping(undefined);
        setActions({});
      },
    },
  );
  const undo = useWrite(contactImportApi.undo, {
    invalidate: [
      ['contact-imports'],
      ['people'],
      ['organizations'],
      ['today'],
      ['trash'],
      ['tags'],
    ],
    onSuccess: (done) => setResult(done),
  });

  function chooseFile(chosen: File | null) {
    setFile(chosen);
    setMapping(undefined);
    setActions({});
    setFilter('all');
    setShown(PAGE);
    setResult(null);
    run.reset();
  }

  return (
    <>
      <SettingsSection title={t('import.title')} lead={t('import.lead')}>
        <p className="text-meta text-foreground-2">{t('import.howto')}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FormField label={t('import.file')}>
            <Input
              key={inputKey}
              type="file"
              className="h-auto py-1.5"
              accept=".vcf,.vcard,.csv,.txt,.json,text/vcard,text/x-vcard,text/csv,application/json"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
          </FormField>
          <FormField label={t('import.space')}>
            <Select value={targetSpace} onChange={(e) => setSpaceId(e.target.value)}>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {spaceName(t, s)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <MonicaFetch onFile={chooseFile} />

        {result && (
          <div className="mt-4 border-l-2 border-foreground pl-3 text-sm" role="status">
            <p>
              {result.undoneAt
                ? t('import.undone', { date: when(result.undoneAt) })
                : t('import.done', {
                    created: result.created,
                    merged: result.merged,
                    skipped: result.skipped,
                  })}
            </p>
            {!result.undoneAt && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/people">{t('import.showPeople')}</Link>
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/duplicates">{t('duplicates.check')}</Link>
                </Button>
                <UndoButton item={result} onUndo={() => undo.mutate(result.id)} />
              </div>
            )}
            <FormMessage tone="error">{undo.isError && errorMessage(t, undo.error)}</FormMessage>
          </div>
        )}

        {file && preview.isFetching && (
          <p className="mt-4 text-sm text-foreground-2" role="status">
            {t('import.reading')}
          </p>
        )}
        <FormMessage tone="error">{preview.isError && errorMessage(t, preview.error)}</FormMessage>

        {file && preview.data && (
          <>
            {preview.data.csv && (
              <ColumnMapping
                csv={preview.data.csv}
                onChange={(next) => {
                  setMapping(next);
                  setActions({});
                }}
              />
            )}
            <div className="mt-5">
              <p className="text-sm font-semibold" role="status">
                {contacts.length === 0
                  ? t('import.nothing')
                  : t('import.summary', {
                      count: contacts.length,
                      create: counts.create,
                      merge: counts.merge,
                      skip: counts.skip,
                    })}
              </p>
              {preview.data.extras && (
                <p className="text-sm text-foreground-2">
                  {t('import.extras', {
                    entries: preview.data.extras.entries,
                    reminders: preview.data.extras.reminders,
                    facts: preview.data.extras.facts,
                    relationships: preview.data.extras.relationships,
                  })}
                </p>
              )}
              {contacts.length > 0 && (
                <>
                  <SegmentedControl
                    className="mt-3"
                    label={t('import.filter.label')}
                    value={filter}
                    onChange={(value) => {
                      setFilter(value);
                      setShown(PAGE);
                    }}
                    options={[
                      { value: 'all', label: t('import.filter.all') },
                      { value: 'new', label: t('import.filter.new') },
                      { value: 'duplicates', label: t('import.filter.duplicates') },
                    ]}
                  />
                  <ul className="mt-2" aria-label={t('import.contacts')}>
                    {visible.slice(0, shown).map((c) => (
                      <ContactRow
                        key={c.index}
                        contact={c}
                        action={actionOf(c)}
                        onAction={(action) => setActions({ ...actions, [c.index]: action })}
                      />
                    ))}
                  </ul>
                  {visible.length > shown && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => setShown(shown + PAGE)}
                    >
                      {t('import.more', { count: visible.length - shown })}
                    </Button>
                  )}
                </>
              )}
              <FormMessage tone="error">{run.isError && errorMessage(t, run.error)}</FormMessage>
              <Button
                className="mt-4"
                disabled={run.isPending || counts.create + counts.merge === 0 || !targetSpace}
                onClick={() => run.mutate(undefined)}
              >
                <Upload aria-hidden />
                {run.isPending
                  ? t('import.running')
                  : t('import.run', { count: counts.create + counts.merge })}
              </Button>
            </div>
          </>
        )}
      </SettingsSection>

      <ImportHistory />
    </>
  );
}
