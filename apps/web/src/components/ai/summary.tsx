import { Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Person } from '@app/shared';
import { CloudNote } from '@/components/ai/cloud-note';
import { FormMessage } from '@/components/form-field';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { aiApi, useAi } from '@/lib/ai';
import { useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';

/** “Summarize”: a short AI briefing from facts and the recent timeline. */
export function AiSummary({ person }: { person: Person }) {
  const { t } = useTranslation();
  const ai = useAi();
  const summary = useWrite(() => aiApi.summary(person.id), { invalidate: [] });
  if (!ai.allowed(person.spaceId)) return null;
  return (
    <div className="border-b py-2">
      {!summary.data ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            variant="ghost"
            disabled={summary.isPending}
            onClick={() => summary.mutate(undefined)}
          >
            <Sparkles aria-hidden />
            {summary.isPending ? t('ai.summarizing') : t('ai.summarize')}
          </Button>
          <CloudNote />
        </div>
      ) : (
        <div className="relative pr-8" role="status" aria-label={t('ai.summary')}>
          <div className="kicker mb-1 text-muted-foreground">{t('ai.summary')}</div>
          <Markdown>{summary.data.text}</Markdown>
          <Button
            size="icon-sm"
            variant="ghost"
            className="absolute top-0 right-0"
            aria-label={t('common.close')}
            onClick={() => summary.reset()}
          >
            <X aria-hidden />
          </Button>
        </div>
      )}
      <FormMessage tone="error">{summary.isError && errorMessage(t, summary.error)}</FormMessage>
    </div>
  );
}
