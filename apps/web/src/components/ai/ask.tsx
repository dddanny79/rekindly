import { Link } from '@tanstack/react-router';
import { MessageCircleQuestion } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudNote } from '@/components/ai/cloud-note';
import { FormMessage } from '@/components/form-field';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { aiApi, useAi } from '@/lib/ai';
import { useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';

/** Search page: a question in plain language, answered by the AI with sources. */
export function AskAi() {
  const { t } = useTranslation();
  const ai = useAi();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const ask = useWrite(aiApi.ask, { invalidate: [] });
  if (!ai.enabled || !ai.anySpace) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (question.trim().length >= 3) ask.mutate(question.trim());
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <MessageCircleQuestion aria-hidden />
        {t('ai.askOpen')}
      </Button>
    );
  }
  const cited = ask.data
    ? ask.data.sources.filter((s) => ask.data.answer.includes(`[${s.n}]`))
    : [];
  return (
    <section className="rounded-sm border p-3" aria-label={t('ai.askTitle')}>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input
          aria-label={t('ai.question')}
          placeholder={t('ai.questionPlaceholder')}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="min-w-0 flex-1"
          autoFocus
        />
        <Button type="submit" disabled={question.trim().length < 3 || ask.isPending}>
          {ask.isPending ? t('ai.thinking') : t('ai.ask')}
        </Button>
      </form>
      <div className="mt-1">
        <CloudNote />
      </div>
      <FormMessage tone="error">{ask.isError && errorMessage(t, ask.error)}</FormMessage>
      {ask.data && (
        <div className="mt-3" role="status" aria-label={t('ai.answer')}>
          <Markdown>{ask.data.answer}</Markdown>
          {(cited.length ? cited : ask.data.sources).length > 0 && (
            <p className="mt-2 text-meta text-muted-foreground">
              {t('ai.sources')}{' '}
              {(cited.length ? cited : ask.data.sources).map((s, i) => (
                <span key={s.n}>
                  {i > 0 && ', '}[{s.n}]{' '}
                  <Link
                    to="/people/$personId"
                    params={{ personId: s.person.id }}
                    className="underline"
                  >
                    {s.person.displayName}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
