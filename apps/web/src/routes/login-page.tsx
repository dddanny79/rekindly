import type { ReactElement } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/auth-layout';
import { FormField, FormMessage } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  passkeysAvailable,
  useAuthStatus,
  useLogin,
  useLoginVerify,
  usePasskeyLogin,
} from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { safeRedirect } from '@/lib/redirect';

const route = getRouteApi('/login');

export function LoginPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { redirect } = route.useSearch();
  const { data: status } = useAuthStatus();
  const login = useLogin();
  const passkeyLogin = usePasskeyLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const verify = useLoginVerify();
  const [challenge, setChallenge] = useState<{ challengeId: string; sentTo: string } | null>(null);
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(false);

  const done = () => void navigate({ to: safeRedirect(redirect), replace: true });
  const error = login.error ?? passkeyLogin.error;
  const pending = login.isPending || passkeyLogin.isPending;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    passkeyLogin.reset();
    login.mutate(
      { email, password },
      {
        onSuccess: (result) => {
          if ('twoFactor' in result) {
            setChallenge(result.twoFactor);
            setCode('');
          } else done();
        },
      },
    );
  }

  if (challenge) {
    return (
      <AuthLayout title={t('auth.code.title')}>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            verify.mutate(
              { challengeId: challenge.challengeId, code, trustDevice: trust },
              { onSuccess: done },
            );
          }}
        >
          <p className="text-sm text-foreground-2">
            {t('auth.code.sent', { to: challenge.sentTo })}
          </p>
          <FormField label={t('auth.code.label')}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              className="max-w-40 text-lg tracking-[0.3em]"
              autoFocus
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
            {t('auth.code.trust')}
          </label>
          <FormMessage tone="error">{verify.error && errorMessage(t, verify.error)}</FormMessage>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={code.length !== 6 || verify.isPending}>
              {t('auth.code.submit')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setChallenge(null);
                verify.reset();
              }}
            >
              {t('auth.code.back')}
            </Button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.login.title')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormField label={t('auth.login.email')}>
          <Input
            type="email"
            autoComplete="username webauthn"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
        </FormField>
        <FormField label={t('auth.login.password')}>
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
        <FormMessage tone="error">{error && errorMessage(t, error)}</FormMessage>
        <Button type="submit" disabled={pending} className="self-start">
          {t('auth.login.submit')}
        </Button>
      </form>

      {status?.passkeysEnabled && passkeysAvailable() && (
        <>
          <div className="kicker my-6 flex items-center gap-3 text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
            {t('auth.login.or')}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              login.reset();
              passkeyLogin.mutate(undefined, { onSuccess: done });
            }}
          >
            <KeyRound aria-hidden />
            {t('auth.login.passkey')}
          </Button>
        </>
      )}
    </AuthLayout>
  );
}
