import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type Locale,
  PASSWORD_MIN_LENGTH,
  setupRequestSchema,
  SUPPORTED_LOCALES,
} from '@app/shared';
import { AuthLayout } from '@/components/auth-layout';
import { FormField, FormMessage } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetup } from '@/lib/auth';
import { errorMessage, fieldErrors } from '@/lib/errors';

export function SetupPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setup = useSetup();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const locale = (i18n.resolvedLanguage ?? 'en') as Locale;

  const update = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const message = (field: string) => {
    const code = errors[field];
    if (!code) return undefined;
    if (field === 'password')
      return t('validation.passwordTooShort', { count: PASSWORD_MIN_LENGTH });
    if (field === 'email' && form.email) return t('validation.email');
    return t('validation.required');
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = setupRequestSchema.safeParse({ ...form, locale });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setup.mutate(parsed.data, { onSuccess: () => void navigate({ to: '/', replace: true }) });
  }

  return (
    <AuthLayout
      kicker={t('auth.setup.kicker')}
      title={t('auth.setup.title')}
      lead={t('auth.setup.lead')}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormField label={t('auth.setup.name')} error={message('name')}>
          <Input autoComplete="name" value={form.name} onChange={update('name')} autoFocus />
        </FormField>
        <FormField label={t('auth.setup.email')} error={message('email')}>
          <Input type="email" autoComplete="email" value={form.email} onChange={update('email')} />
        </FormField>
        <FormField
          label={t('auth.setup.password')}
          hint={t('auth.setup.passwordHint', { count: PASSWORD_MIN_LENGTH })}
          error={message('password')}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
          />
        </FormField>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-foreground-2">
            {t('auth.setup.language')}
          </span>
          <SegmentedControl
            label={t('auth.setup.language')}
            value={locale}
            options={SUPPORTED_LOCALES.map((value) => ({ value, label: t(`language.${value}`) }))}
            onChange={(value) => void i18n.changeLanguage(value)}
          />
        </div>
        <FormMessage tone="error">{setup.isError && errorMessage(t, setup.error)}</FormMessage>
        <Button type="submit" disabled={setup.isPending} className="self-start">
          {t('auth.setup.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
