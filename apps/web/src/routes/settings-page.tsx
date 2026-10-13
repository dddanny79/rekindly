import { Link, useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiStatus } from '@/components/api-status';
import { LanguageRadioGroup } from '@/components/language-controls';
import { PasskeySettings } from '@/components/passkey-list';
import { PasswordForm } from '@/components/password-form';
import { SettingsSection } from '@/components/settings-section';
import { ThemeControl } from '@/components/theme-control';
import { TwoFactorSettings } from '@/components/two-factor-settings';
import { Button } from '@/components/ui/button';
import { useAuthStatus, useLogout } from '@/lib/auth';

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: status } = useAuthStatus();
  const logout = useLogout();

  return (
    <>
      <div>
        <SettingsSection title={t('account.title')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-serif text-read">{status?.account?.name}</div>
              <div className="text-meta text-muted-foreground">{status?.account?.email}</div>
            </div>
            <Button
              variant="secondary"
              disabled={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, {
                  onSettled: () => void navigate({ to: '/login', replace: true }),
                })
              }
            >
              <LogOut aria-hidden />
              {t('auth.logout')}
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection title={t('passkeys.title')} lead={t('passkeys.lead')}>
          <PasskeySettings />
        </SettingsSection>

        <SettingsSection title={t('account.password.title')}>
          <PasswordForm />
        </SettingsSection>

        <SettingsSection title={t('twoFactor.title')} lead={t('twoFactor.lead')}>
          <TwoFactorSettings />
        </SettingsSection>

        <SettingsSection title={t('theme.label')} lead={t('appearance.generalLead')}>
          <ThemeControl className="max-w-md" />
          <p className="mt-3 text-sm">
            <Link to="/settings/appearance">{t('appearance.moreLink')}</Link>
          </p>
        </SettingsSection>

        <SettingsSection title={t('language.label')}>
          <LanguageRadioGroup className="-mt-3 border-t-0" />
        </SettingsSection>

        <ApiStatus className="mt-9" />
      </div>
    </>
  );
}
