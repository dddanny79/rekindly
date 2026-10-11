import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/segmented-control';
import { setThemePreference, THEME_PREFERENCES, useThemePreference } from '@/lib/theme';

export function ThemeControl({ className }: { className?: string }) {
  const { t } = useTranslation();
  const preference = useThemePreference();

  return (
    <SegmentedControl
      label={t('theme.label')}
      value={preference}
      options={THEME_PREFERENCES.map((value) => ({ value, label: t(`theme.${value}`) }))}
      onChange={setThemePreference}
      className={className}
    />
  );
}
