import type { ReactElement } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/auth-layout';
import { FormField, FormMessage } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { passkeysAvailable, useAuthStatus, useLogin, usePasskeyLogin } from '@/lib/auth';
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

  const done = () => void navigate({ to: safeRedirect(redirect), replace: true });
  const error = login.error ?? passkeyLogin.error;
  const pending = login.isPending || passkeyLogin.isPending;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    passkeyLogin.reset();
    login.mutate({ email, password }, { onSuccess: done });
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
