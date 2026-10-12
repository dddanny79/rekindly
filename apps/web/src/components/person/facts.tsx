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
import { GripVertical, Pin, PinOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Fact } from '@app/shared';
import { InlineText } from '@/components/inline-edit';
import { RemoveButton } from '@/components/row-actions';
import { SideSection } from '@/components/side-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { factsApi, useWrite } from '@/lib/data';
import { cn } from '@/lib/utils';

const FACT_KEYS = [['people']];

function FactRow({ personId, fact }: { personId: string; fact: Fact }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fact.id,
  });
  const update = useWrite(
    (patch: { text?: string; pinned?: boolean }) => factsApi.update(personId, fact.id, patch),
    {
      invalidate: FACT_KEYS,
    },
  );
  const remove = useWrite(() => factsApi.remove(personId, fact.id), { invalidate: FACT_KEYS });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex items-start gap-1.5 border-b bg-background py-1.5',
        isDragging && 'relative z-10 shadow-overlay',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('facts.move', { text: fact.text })}
        className="mt-0.5 cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <InlineText
          label={t('facts.text')}
          value={fact.text}
          validate={(v) => (v.trim() ? null : t('validation.required'))}
          onSave={(text) => update.mutateAsync({ text })}
        />
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-pressed={fact.pinned}
        aria-label={
          fact.pinned ? t('facts.unpin', { text: fact.text }) : t('facts.pin', { text: fact.text })
        }
        onClick={() => update.mutate({ pinned: !fact.pinned })}
        className={cn(
          'md:size-7',
          !fact.pinned &&
            'md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100',
        )}
      >
        {fact.pinned ? <Pin aria-hidden className="fill-current" /> : <PinOff aria-hidden />}
      </Button>
      <div className="md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <RemoveButton
          label={t('common.removeNamed', { name: fact.text })}
          title={t('facts.removeTitle')}
          description={fact.text}
          onConfirm={() => remove.mutate(undefined)}
        />
      </div>
    </li>
  );
}

/** Short, pinnable statements about the person; pinned ones form the briefing. */
export function FactsSection({ personId, facts }: { personId: string; facts: Fact[] }) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<string[] | null>(null);
  const [text, setText] = useState('');
  const add = useWrite((input: { text: string }) => factsApi.create(personId, input), {
    invalidate: FACT_KEYS,
  });
  const reorder = useWrite((ids: string[]) => factsApi.reorder(personId, ids), {
    invalidate: FACT_KEYS,
    onSuccess: () => setOrder(null),
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = order ?? facts.map((f) => f.id);
  const sorted = ids.map((id) => facts.find((f) => f.id === id)).filter((f): f is Fact => !!f);

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
    // Clear right away so typing the next fact is not interrupted; restore on error.
    setText('');
    add.mutate({ text: value }, { onError: () => setText((current) => current || value) });
  }

  return (
    <SideSection title={t('facts.title')}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul aria-label={t('facts.title')}>
            {sorted.map((fact) => (
              <FactRow key={fact.id} personId={personId} fact={fact} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <form onSubmit={submit} className="pt-2">
        <Input
          aria-label={t('facts.add')}
          placeholder={t('facts.addPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
        />
      </form>
    </SideSection>
  );
}
