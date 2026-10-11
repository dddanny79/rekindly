import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { changePasswordRequestSchema, PASSWORD_MIN_LENGTH } from '@app/shared';
import { FormField, FormMessage } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChangePassword } from '@/lib/auth';
import { errorMessage, fieldErrors } from '@/lib/errors';

export function PasswordForm() {
  const { t } = useTranslation();
  const change = useChangePassword();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = changePasswordRequestSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    change.mutate(parsed.data, {
      onSuccess: () => {
        setCurrent('');
        setNew('');
      },
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField
        label={t('account.password.current')}
        error={errors.currentPassword && t('validation.required')}
      >
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </FormField>
      <FormField
        label={t('account.password.new')}
        hint={t('auth.setup.passwordHint', { count: PASSWORD_MIN_LENGTH })}
        error={
          errors.newPassword && t('validation.passwordTooShort', { count: PASSWORD_MIN_LENGTH })
        }
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNew(event.target.value)}
        />
      </FormField>
      <FormMessage tone="error">{change.isError && errorMessage(t, change.error)}</FormMessage>
      <FormMessage tone="success">{change.isSuccess && t('account.password.done')}</FormMessage>
      <Button type="submit" variant="secondary" disabled={change.isPending} className="self-start">
        {t('account.password.submit')}
      </Button>
    </form>
  );
}
