import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { twoFactorStatusSchema, twoFactorStartResponseSchema } from '@app/shared';
import { FormField, FormMessage } from '@/components/form-field';
import { RemoveButton } from '@/components/row-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';

const TF = '/api/v1/auth/two-factor';
const statusQuery = { queryKey: ['two-factor'], queryFn: () => api(TF, twoFactorStatusSchema) };

/** Settings: sign-in codes by email — switch on (with a test code), off, trusted devices. */
export function TwoFactorSettings() {
  const { t, i18n } = useTranslation();
  const { data: status } = useQuery(statusQuery);
  const [challenge, setChallenge] = useState<{ challengeId: string; sentTo: string } | null>(null);
  const [code, setCode] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [password, setPassword] = useState('');
  const start = useWrite(
    () => api(`${TF}/start`, twoFactorStartResponseSchema, { method: 'POST' }),
    {
      invalidate: [],
      onSuccess: (result) => {
        setChallenge(result);
        setCode('');
      },
    },
  );
  const enable = useWrite(
    () => api(`${TF}/enable`, null, { json: { challengeId: challenge!.challengeId, code } }),
    { invalidate: [['two-factor']], onSuccess: () => setChallenge(null) },
  );
  const disable = useWrite(() => api(`${TF}/disable`, null, { json: { password } }), {
    invalidate: [['two-factor']],
    onSuccess: () => {
      setDisabling(false);
      setPassword('');
    },
  });
  const forget = useWrite((id: string) => api(`${TF}/devices/${id}`, null, { method: 'DELETE' }), {
    invalidate: [['two-factor']],
  });
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' }).format(new Date(iso));
  if (!status) return null;

  if (!status.enabled) {
    if (!status.mailReady) {
      return (
        <p className="text-sm text-foreground-2">
          {t('twoFactor.needsMail')}{' '}
          <Link to="/settings/mail" className="underline">
            {t('twoFactor.mailLink')}
          </Link>
        </p>
      );
    }
    return challenge ? (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          enable.mutate(undefined);
        }}
      >
        <p className="text-sm text-foreground-2">{t('auth.code.sent', { to: challenge.sentTo })}</p>
        <FormField label={t('auth.code.label')}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="max-w-40 tracking-[0.3em]"
            autoFocus
          />
        </FormField>
        <FormMessage tone="error">{enable.isError && errorMessage(t, enable.error)}</FormMessage>
        <div className="flex gap-2">
          <Button type="submit" disabled={code.length !== 6 || enable.isPending}>
            {t('twoFactor.confirm')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setChallenge(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    ) : (
      <div>
        <Button
          variant="secondary"
          disabled={start.isPending}
          onClick={() => start.mutate(undefined)}
        >
          {start.isPending ? t('twoFactor.sending') : t('twoFactor.enable')}
        </Button>
        <FormMessage tone="error">{start.isError && errorMessage(t, start.error)}</FormMessage>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" role="status">
        {t('twoFactor.on')}
      </p>
      {status.trustedDevices.length > 0 && (
        <ul className="border-t" aria-label={t('twoFactor.devices')}>
          {status.trustedDevices.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 border-b py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold">
                  {d.userAgent ?? t('twoFactor.unknownDevice')}
                  {d.current && (
                    <span className="ml-2 font-normal text-foreground-2">
                      {t('twoFactor.thisDevice')}
                    </span>
                  )}
                </div>
                <div className="text-foreground-2">
                  {t('twoFactor.trustedUntil', { date: date(d.expiresAt) })}
                </div>
              </div>
              <RemoveButton
                label={t('twoFactor.forget')}
                title={t('twoFactor.forgetTitle')}
                onConfirm={() => forget.mutate(d.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {disabling ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            disable.mutate(undefined);
          }}
        >
          <FormField label={t('account.password.current')}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </FormField>
          <Button type="submit" variant="destructive" disabled={!password || disable.isPending}>
            {t('twoFactor.disable')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setDisabling(false)}>
            {t('common.cancel')}
          </Button>
        </form>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setDisabling(true)}>
            {t('twoFactor.disable')}
          </Button>
        </div>
      )}
      <FormMessage tone="error">{disable.isError && errorMessage(t, disable.error)}</FormMessage>
    </div>
  );
}
