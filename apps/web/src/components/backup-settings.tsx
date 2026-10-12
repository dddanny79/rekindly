import { useQuery } from '@tanstack/react-query';
import { CloudUpload, RefreshCw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackupSettings } from '@app/shared';
import { FormField, FormMessage } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { backupApi, backupFilesQuery, backupQuery, importStatusQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';

type Kind = BackupSettings['kind'];

function useDateTime() {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (iso: string) => format.format(new Date(iso));
}

/** Last result and “Back up now”. */
function Status({ settings }: { settings: BackupSettings }) {
  const { t } = useTranslation();
  const when = useDateTime();
  const run = useWrite(backupApi.run, { invalidate: [['backup'], ['today']] });
  const s = settings.status;
  const failed = s.lastErrorAt && (!s.lastSuccessAt || s.lastErrorAt > s.lastSuccessAt);
  return (
    <div
      className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-3"
      role="status"
    >
      <div className="min-w-0 text-sm">
        {s.lastSuccessAt ? (
          <div>
            {t('backup.lastSuccess', { date: when(s.lastSuccessAt) })}
            {s.lastSize && (
              <span className="num text-muted-foreground">
                {' '}
                · {Math.max(1, Math.round(s.lastSize / 1024))} KB
              </span>
            )}
          </div>
        ) : (
          <div className="text-muted-foreground">{t('backup.never')}</div>
        )}
        {failed && (
          <div className="mt-1 font-semibold text-signal break-words">
            {t('backup.lastFailed', { date: when(s.lastErrorAt!) })} {s.lastError}
          </div>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={run.isPending}
        onClick={() => run.mutate(undefined)}
      >
        <CloudUpload aria-hidden />
        {run.isPending ? t('backup.running') : t('backup.runNow')}
      </Button>
    </div>
  );
}

/** Backups at the target, restorable into this instance while it is empty. */
function RemoteBackups() {
  const { t } = useTranslation();
  const when = useDateTime();
  const files = useQuery(backupFilesQuery);
  const { data: status } = useQuery(importStatusQuery);
  const [chosen, setChosen] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [done, setDone] = useState(false);
  const restore = useWrite(
    ({ name, passphrase }: { name: string; passphrase: string }) =>
      backupApi.restore(name, passphrase),
    {
      invalidate: [['people'], ['organizations'], ['spaces'], ['import-status'], ['today']],
      onSuccess: () => setDone(true),
    },
  );

  return (
    <div className="mt-5">
      <Button
        variant="ghost"
        size="sm"
        disabled={files.isFetching}
        onClick={() => void files.refetch()}
      >
        <RefreshCw aria-hidden />
        {t('backup.showFiles')}
      </Button>
      <FormMessage tone="error">{files.isError && errorMessage(t, files.error)}</FormMessage>
      {files.data && files.data.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">{t('backup.noFiles')}</p>
      )}
      {files.data && files.data.length > 0 && (
        <ul className="mt-2">
          {files.data.map((f) => (
            <li key={f.name} className="border-b py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="num min-w-0 text-sm break-all">
                  {f.modified ? when(f.modified) : f.name}
                  <span className="text-muted-foreground">
                    {' '}
                    · {Math.max(1, Math.round(f.size / 1024))} KB
                  </span>
                </span>
                {status?.empty && !done && (
                  <Button size="xs" variant="secondary" onClick={() => setChosen(f.name)}>
                    {t('backup.restore')}
                  </Button>
                )}
              </div>
              {chosen === f.name && !done && (
                <form
                  className="mt-2 flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    restore.mutate({ name: f.name, passphrase });
                  }}
                >
                  <Input
                    type="password"
                    aria-label={t('backup.passphrase')}
                    placeholder={t('backup.passphrase')}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="w-60"
                    autoFocus
                  />
                  <Button type="submit" size="sm" disabled={!passphrase || restore.isPending}>
                    {restore.isPending ? t('data.import.running') : t('backup.restore')}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormMessage tone="error">{restore.isError && errorMessage(t, restore.error)}</FormMessage>
      {done && (
        <p className="mt-2 text-sm" role="status">
          {t('backup.restored')}
        </p>
      )}
    </div>
  );
}

/** Settings › Data: nightly, encrypted backups to WebDAV or S3. */
export function BackupSettingsSection() {
  const { t } = useTranslation();
  const { data: settings } = useQuery(backupQuery);
  if (!settings) return null;
  return (
    <SettingsSection title={t('backup.title')} lead={t('backup.lead')}>
      {settings.configured && <Status settings={settings} />}
      <BackupForm settings={settings} />
      {settings.configured && <RemoteBackups />}
    </SettingsSection>
  );
}

function BackupForm({ settings }: { settings: BackupSettings }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>(settings.kind);
  const [enabled, setEnabled] = useState(settings.configured ? settings.enabled : true);
  const [hour, setHour] = useState(settings.hour);
  const [keep, setKeep] = useState(String(settings.keep));
  const [dav, setDav] = useState({
    url: settings.webdav?.url ?? '',
    username: settings.webdav?.username ?? '',
    password: '',
  });
  const [s3, setS3] = useState({
    endpoint: settings.s3?.endpoint ?? '',
    region: settings.s3?.region ?? '',
    bucket: settings.s3?.bucket ?? '',
    prefix: settings.s3?.prefix ?? '',
    accessKeyId: settings.s3?.accessKeyId ?? '',
    secretAccessKey: '',
  });
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = useWrite(backupApi.save, {
    invalidate: [['backup'], ['today']],
    onSuccess: () => {
      setSaved(true);
      setPassphrase('');
      setRepeat('');
      setDav((current) => ({ ...current, password: '' }));
      setS3((current) => ({ ...current, secretAccessKey: '' }));
    },
  });
  const test = useWrite(backupApi.test, { invalidate: [] });
  const kept = t('backup.keptSecret');

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    if (passphrase !== repeat) return setMismatch(true);
    setMismatch(false);
    save.mutate({
      enabled,
      kind,
      hour,
      keep: Math.max(1, Number(keep) || 14),
      ...(passphrase ? { passphrase } : {}),
      ...(kind === 'webdav'
        ? {
            webdav: {
              url: dav.url,
              username: dav.username,
              ...(dav.password ? { password: dav.password } : {}),
            },
          }
        : {
            s3: {
              endpoint: s3.endpoint,
              region: s3.region,
              bucket: s3.bucket,
              prefix: s3.prefix,
              accessKeyId: s3.accessKeyId,
              ...(s3.secretAccessKey ? { secretAccessKey: s3.secretAccessKey } : {}),
            },
          }),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {t('backup.enabled')}
      </label>
      <div>
        <div className="mb-1.5 text-sm font-semibold">{t('backup.target')}</div>
        <SegmentedControl
          label={t('backup.target')}
          value={kind}
          onChange={(value) => setKind(value as Kind)}
          options={[
            { value: 'webdav', label: t('backup.webdav') },
            { value: 's3', label: t('backup.s3') },
          ]}
        />
      </div>
      {kind === 'webdav' ? (
        <>
          <FormField label={t('backup.url')} hint={t('backup.urlHint')}>
            <Input
              value={dav.url}
              onChange={(e) => setDav({ ...dav, url: e.target.value })}
              placeholder="https://cloud.example.com/remote.php/dav/files/me/Backups/"
            />
          </FormField>
          <FormField label={t('backup.username')}>
            <Input
              value={dav.username}
              onChange={(e) => setDav({ ...dav, username: e.target.value })}
              autoComplete="off"
            />
          </FormField>
          <FormField label={t('backup.password')}>
            <Input
              type="password"
              value={dav.password}
              onChange={(e) => setDav({ ...dav, password: e.target.value })}
              placeholder={settings.webdav?.hasPassword ? kept : ''}
              autoComplete="new-password"
            />
          </FormField>
        </>
      ) : (
        <>
          <FormField label={t('backup.endpoint')} hint={t('backup.endpointHint')}>
            <Input
              value={s3.endpoint}
              onChange={(e) => setS3({ ...s3, endpoint: e.target.value })}
              placeholder="https://fsn1.your-objectstorage.com"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('backup.region')}>
              <Input
                value={s3.region}
                onChange={(e) => setS3({ ...s3, region: e.target.value })}
                placeholder="eu-central"
              />
            </FormField>
            <FormField label={t('backup.bucket')}>
              <Input value={s3.bucket} onChange={(e) => setS3({ ...s3, bucket: e.target.value })} />
            </FormField>
          </div>
          <FormField label={t('backup.prefix')}>
            <Input
              value={s3.prefix}
              onChange={(e) => setS3({ ...s3, prefix: e.target.value })}
              placeholder="rekindly/"
            />
          </FormField>
          <FormField label={t('backup.accessKey')}>
            <Input
              value={s3.accessKeyId}
              onChange={(e) => setS3({ ...s3, accessKeyId: e.target.value })}
              autoComplete="off"
            />
          </FormField>
          <FormField label={t('backup.secretKey')}>
            <Input
              type="password"
              value={s3.secretAccessKey}
              onChange={(e) => setS3({ ...s3, secretAccessKey: e.target.value })}
              placeholder={settings.s3?.hasSecret ? kept : ''}
              autoComplete="new-password"
            />
          </FormField>
        </>
      )}
      <p className="text-meta text-foreground-2">{t('backup.passphraseHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('backup.passphrase')}>
          <Input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder={settings.hasPassphrase ? kept : t('backup.passphraseMin')}
            autoComplete="new-password"
          />
        </FormField>
        <FormField label={t('backup.passphraseRepeat')}>
          <Input
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('backup.hour')}>
          <Select value={String(hour)} onChange={(e) => setHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('backup.keep')}>
          <Input
            type="number"
            min={1}
            max={365}
            value={keep}
            onChange={(e) => setKeep(e.target.value)}
          />
        </FormField>
      </div>
      <FormMessage tone="error">
        {mismatch ? t('backup.mismatch') : save.isError ? errorMessage(t, save.error) : null}
      </FormMessage>
      <FormMessage tone="error">{test.isError && errorMessage(t, test.error)}</FormMessage>
      {saved && !save.isError && <p className="text-sm text-foreground-2">{t('backup.saved')}</p>}
      {test.isSuccess && <p className="text-sm text-foreground-2">{t('backup.testOk')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          {t('common.save')}
        </Button>
        {settings.configured && (
          <Button
            type="button"
            variant="secondary"
            disabled={test.isPending}
            onClick={() => test.mutate(undefined)}
          >
            {test.isPending ? t('backup.testing') : t('backup.test')}
          </Button>
        )}
      </div>
    </form>
  );
}
