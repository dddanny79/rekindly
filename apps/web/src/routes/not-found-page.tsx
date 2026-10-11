import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader kicker={t('notFound.kicker')} title={t('notFound.title')} />
      <Button asChild variant="secondary" className="mt-6">
        <Link to="/">{t('notFound.back')}</Link>
      </Button>
    </>
  );
}
