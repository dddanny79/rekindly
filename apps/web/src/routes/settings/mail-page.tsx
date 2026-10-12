import { useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { mailSettingsSchema, type MailSettings } from '@app/shared';
import { FormField, FormMessage } from '@/components/form-field';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { z } from 'zod';

const MAIL = '/api/v1/mail';
const mailQuery = { queryKey: ['mail'], queryFn: () => api(MAIL, mailSettingsSchema) };
const save = (input: object) => api(MAIL, mailSettingsSchema, { method: 'PUT', json: input });

function useDateTime() {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (iso: string) => format.format(new Date(iso));
}

function SmtpForm({ settings }: { settings: MailSettings }) {
  const { t } = useTranslation();
  const fromEnv = settings.source === 'env';
  const [host, setHost] = useState(settings.host ?? '');
  const [port, setPort] = useState(settings.port ? String(settings.port) : '');
  const [security, setSecurity] = useState(settings.security);
  const [username, setUsername] = useState(settings.username ?? '');
  const [password, setPassword] = useState('');
  const [from, setFrom] = useState(settings.from ?? '');
  const [saved, setSaved] = useState(false);
  const write = useWrite(save, {
    invalidate: [['mail'], ['two-factor']],
    onSuccess: () => {
      setSaved(true);
      setPassword('');
    },
  });
  const test = useWrite(() => api(`${MAIL}/test`, null, { method: 'POST' }), {
    invalidate: [['mail']],
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    test.reset();
    write.mutate({
      host,
      port: port ? Number(port) : undefined,
      security,
      username,
      from,
      ...(password ? { password } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={t('mail.smtp')}>
      {fromEnv && <p className="text-sm text-foreground-2">{t('mail.fromEnv')}</p>}
      <fieldset disabled={fromEnv} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <FormField label={t('mail.host')}>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.example.com"
            />
          </FormField>
          <FormField label={t('mail.port')}>
            <Input
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
              placeholder="587"
            />
          </FormField>
        </div>
        <FormField label={t('mail.security')}>
          <Select
            value={security}
            onChange={(e) => setSecurity(e.target.value as MailSettings['security'])}
            className="max-w-xs"
          >
            <option value="starttls">{t('mail.securities.starttls')}</option>
            <option value="tls">{t('mail.securities.tls')}</option>
            <option value="none">{t('mail.securities.none')}</option>
          </Select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('mail.username')}>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <FormField label={t('mail.password')}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={settings.hasPassword ? t('backup.keptSecret') : ''}
              autoComplete="new-password"
            />
          </FormField>
        </div>
        <FormField label={t('mail.from')} hint={t('mail.fromHint')}>
          <Input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Rekindly <rekindly@example.com>"
          />
        </FormField>
      </fieldset>
      <p className="text-sm text-foreground-2">{t('mail.to', { to: settings.to ?? '—' })}</p>
      <FormMessage tone="error">{write.isError && errorMessage(t, write.error)}</FormMessage>
      <FormMessage tone="error">{test.isError && errorMessage(t, test.error)}</FormMessage>
      {saved && !write.isError && <p className="text-sm text-foreground-2">{t('backup.saved')}</p>}
      {test.isSuccess && (
        <p className="text-sm text-foreground-2" role="status">
          {t('mail.testSent', { to: settings.to })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!fromEnv && (
          <Button type="submit" disabled={write.isPending}>
            {t('common.save')}
          </Button>
        )}
        {settings.source !== 'none' && (
          <Button
            type="button"
            variant="secondary"
            disabled={test.isPending}
            onClick={() => test.mutate(undefined)}
          >
            <Send aria-hidden />
            {test.isPending ? t('mail.testing') : t('mail.test')}
          </Button>
        )}
      </div>
    </form>
  );
}

function DigestForm({ settings }: { settings: MailSettings }) {
  const { t } = useTranslation();
  const when = useDateTime();
  const write = useWrite(save, { invalidate: [['mail']] });
  const now = useWrite(
    () => api(`${MAIL}/digest`, z.object({ sent: z.boolean() }), { method: 'POST' }),
    {
      invalidate: [['mail']],
    },
  );
  const digest = settings.digest;
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={digest.enabled}
          disabled={settings.source === 'none'}
          onChange={(e) => write.mutate({ digest: { ...digest, enabled: e.target.checked } })}
        />
        {t('mail.digestEnabled')}
      </label>
      <FormField label={t('mail.digestHour')}>
        <Select
          value={String(digest.hour)}
          onChange={(e) => write.mutate({ digest: { ...digest, hour: Number(e.target.value) } })}
          className="max-w-xs"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </Select>
      </FormField>
      {settings.status.lastSentAt && (
        <p className="text-meta text-foreground-2">
          {t('mail.lastSent', { date: when(settings.status.lastSentAt) })}
        </p>
      )}
      {settings.status.lastError && settings.status.lastErrorAt && (
        <p className="text-meta font-semibold text-signal">
          {t('mail.lastError', { date: when(settings.status.lastErrorAt) })}{' '}
          {settings.status.lastError}
        </p>
      )}
      <FormMessage tone="error">
        {(write.isError && errorMessage(t, write.error)) ||
          (now.isError && errorMessage(t, now.error))}
      </FormMessage>
      {now.data && (
        <p className="text-sm text-foreground-2" role="status">
          {now.data.sent ? t('mail.digestSent') : t('mail.digestEmpty')}
        </p>
      )}
      {settings.source !== 'none' && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={now.isPending}
            onClick={() => now.mutate(undefined)}
          >
            {t('mail.digestNow')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Settings › Mail: SMTP server, test mail, daily summary. */
export function MailSettingsPage() {
  const { t } = useTranslation();
  const { data: settings } = useQuery(mailQuery);
  if (!settings) return null;
  return (
    <>
      <SettingsSection title={t('mail.title')} lead={t('mail.lead')}>
        <SmtpForm settings={settings} />
      </SettingsSection>
      <SettingsSection title={t('mail.digestTitle')} lead={t('mail.digestLead')}>
        <DigestForm settings={settings} />
      </SettingsSection>
    </>
  );
}
