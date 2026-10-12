import { useTranslation } from 'react-i18next';
import { useAi } from '@/lib/ai';

/** Before a cloud call: where the data goes. Nothing for a local model. */
export function CloudNote() {
  const { t } = useTranslation();
  const { cloud, target } = useAi();
  if (!cloud) return null;
  return <span className="text-meta text-muted-foreground">{t('ai.sendsTo', { target })}</span>;
}
