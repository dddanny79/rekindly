import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Question } from '@app/shared';
import { FormMessage } from '@/components/form-field';
import { InlineText } from '@/components/inline-edit';
import { RemoveButton } from '@/components/row-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { questionsApi, TIMELINE_KEYS, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

const QUESTION_KEYS = [['people'], ['search'], ['trash']];

function QuestionRow({ personId, question }: { personId: string; question: Question }) {
  const { t } = useTranslation();
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState('');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });
  const update = useWrite((text: string) => questionsApi.update(personId, question.id, { text }), {
    invalidate: QUESTION_KEYS,
  });
  const remove = useWrite(() => questionsApi.remove(personId, question.id), {
    invalidate: QUESTION_KEYS,
  });
  // An answer becomes a note in the timeline, so refresh timelines too.
  const asked = useWrite(
    (input: { answer?: string }) => questionsApi.asked(personId, question.id, input),
    { invalidate: TIMELINE_KEYS },
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = answer.trim();
    asked.mutate(value ? { answer: value } : {});
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group border-b bg-background py-1.5',
        isDragging && 'relative z-10 shadow-overlay',
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('questions.move', { text: question.text })}
          className="mt-0.5 cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <input
          type="checkbox"
          checked={answering}
          aria-label={t('questions.asked', { text: question.text })}
          aria-expanded={answering}
          onChange={(e) => setAnswering(e.target.checked)}
          className="mt-1.5 size-4 shrink-0 cursor-pointer accent-foreground"
        />
        <div className="min-w-0 flex-1">
          <InlineText
            label={t('questions.text')}
            value={question.text}
            validate={(v) => (v.trim() ? null : t('validation.required'))}
            onSave={(text) => update.mutateAsync(text)}
          />
        </div>
        <div className="md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <RemoveButton
            label={t('common.removeNamed', { name: question.text })}
            title={t('questions.removeTitle')}
            description={question.text}
            onConfirm={() => remove.mutate(undefined)}
          />
        </div>
      </div>
      {answering && (
        <form onSubmit={submit} className="flex flex-col gap-2 pt-2 pl-12">
          <Input
            aria-label={t('questions.answer', { text: question.text })}
            placeholder={t('questions.answerPlaceholder')}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAnswering(false);
            }}
            maxLength={5000}
            autoFocus
          />
          <FormMessage tone="error">{asked.isError && errorMessage(t, asked.error)}</FormMessage>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={asked.isPending}>
              {t('questions.done')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAnswering(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

/**
 * Questions for the next conversation, at the top of the briefing. Ticking one asks
 * for an optional answer; with an answer, a note lands in the timeline.
 */
export function QuestionList({
  personId,
  questions,
  adding,
  onDoneAdding,
}: {
  personId: string;
  questions: Question[];
  adding: boolean;
  onDoneAdding: () => void;
}) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<string[] | null>(null);
  const [text, setText] = useState('');
  const add = useWrite((input: { text: string }) => questionsApi.create(personId, input), {
    invalidate: QUESTION_KEYS,
  });
  const reorder = useWrite((ids: string[]) => questionsApi.reorder(personId, ids), {
    invalidate: QUESTION_KEYS,
    onSuccess: () => setOrder(null),
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!questions.length && !adding) return null;

  const ids = order ?? questions.map((q) => q.id);
  const sorted = ids
    .map((id) => questions.find((q) => q.id === id))
    .filter((q): q is Question => !!q);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setOrder(next);
    reorder.mutate(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    // Clear right away so the next question can be typed; restore on error.
    setText('');
    add.mutate({ text: value }, { onError: () => setText((current) => current || value) });
  }

  return (
    <div className="pt-2" data-testid="briefing-questions">
      <h3 className="kicker text-muted-foreground">{t('questions.title')}</h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul aria-label={t('questions.title')}>
            {sorted.map((question) => (
              <QuestionRow key={question.id} personId={personId} question={question} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {adding && (
        <form onSubmit={submit} className="border-b py-2">
          <Input
            aria-label={t('questions.input')}
            placeholder={t('questions.addPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onDoneAdding();
            }}
            onBlur={() => {
              if (!text.trim()) onDoneAdding();
            }}
            maxLength={500}
            autoFocus
          />
          <FormMessage tone="error">{add.isError && errorMessage(t, add.error)}</FormMessage>
        </form>
      )}
    </div>
  );
}
