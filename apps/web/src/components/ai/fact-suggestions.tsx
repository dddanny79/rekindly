import { Check, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiFactSuggestion, Entry } from '@app/shared';
import { CloudNote } from '@/components/ai/cloud-note';
import { FormMessage } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { aiApi, useAi } from '@/lib/ai';
import { factsApi, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';

/** Facts the AI found in a note; each one is added only when confirmed. */
export function FactSuggestions({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const { t } = useTranslation();
  const [handled, setHandled] = useState<Set<number>>(new Set());
  const suggest = useWrite(() => aiApi.facts(entry.id), { invalidate: [] });
  const add = useWrite(
    ({ s }: { s: AiFactSuggestion; i: number }) => factsApi.create(s.person.id, { text: s.text }),
    {
      invalidate: [['people']],
    },
  );
  const { cloud } = useAi();
  // A local model: start right away; for the cloud, ask first (CloudNote).
  const start = suggest.mutate;
  const started = useRef(false);
  useEffect(() => {
    if (cloud || started.current) return;
    started.current = true;
    start(undefined);
  }, [cloud, start]);
  const done = (i: number) => setHandled(new Set(handled).add(i));
  const several = new Set(entry.people.map((p) => p.id)).size > 1;

  if (!suggest.data && !suggest.isPending && !suggest.isError) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="xs" variant="secondary" onClick={() => suggest.mutate(undefined)}>
          <Sparkles aria-hidden />
          {t('ai.suggestFacts')}
        </Button>
        <CloudNote />
        <Button size="xs" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    );
  }
  const open = suggest.data?.suggestions.filter((_, i) => !handled.has(i)) ?? [];
  return (
    <div className="mt-2 rounded-sm border p-3" role="status" aria-label={t('ai.factSuggestions')}>
      <div className="flex items-center justify-between">
        <span className="kicker text-muted-foreground">{t('ai.factSuggestions')}</span>
        <Button size="icon-sm" variant="ghost" aria-label={t('common.close')} onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      {suggest.isPending && <p className="text-sm text-foreground-2">{t('ai.thinking')}</p>}
      <FormMessage tone="error">{suggest.isError && errorMessage(t, suggest.error)}</FormMessage>
      {suggest.data && open.length === 0 && (
        <p className="text-sm text-foreground-2">
          {suggest.data.suggestions.length ? t('ai.factsDone') : t('ai.noFacts')}
        </p>
      )}
      <ul>
        {suggest.data?.suggestions.map((s, i) =>
          handled.has(i) ? null : (
            <li
              key={i}
              className="flex items-center justify-between gap-2 border-b py-1.5 last:border-b-0"
            >
              <span className="min-w-0 text-sm break-words">
                {several && <span className="font-semibold">{s.person.displayName}: </span>}
                {s.text}
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={add.isPending}
                  onClick={() => add.mutate({ s, i }, { onSuccess: () => done(i) })}
                >
                  <Check aria-hidden />
                  {t('ai.addFact')}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => done(i)}>
                  {t('ai.dismiss')}
                </Button>
              </span>
            </li>
          ),
        )}
      </ul>
      <FormMessage tone="error">{add.isError && errorMessage(t, add.error)}</FormMessage>
    </div>
  );
}
