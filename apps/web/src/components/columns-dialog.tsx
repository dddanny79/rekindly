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
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { type ColumnDef, useColumnDefs } from '@/lib/people-column-defs';
import { type PeopleColumn, setPeopleColumns, usePeopleColumns } from '@/lib/people-columns';
import { cn } from '@/lib/utils';

function ChosenRow({
  def,
  index,
  count,
  onMove,
  onHide,
}: {
  def: ColumnDef;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onHide: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: def.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1.5 border-b bg-popover py-1',
        isDragging && 'relative z-10 shadow-overlay',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('people.columns.move', { column: def.label })}
        className="cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1">
        <input
          type="checkbox"
          checked
          onChange={onHide}
          aria-label={t('people.columns.show', { column: def.label })}
        />
        <span className="truncate">{def.label}</span>
        {def.id === 'space' && (
          <span className="truncate text-meta text-muted-foreground">
            {t('people.columns.onlyAllSpaces')}
          </span>
        )}
      </label>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={index === 0}
        aria-label={t('people.columns.up', { column: def.label })}
        onClick={() => onMove(index, index - 1)}
      >
        <ArrowUp aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={index === count - 1}
        aria-label={t('people.columns.down', { column: def.label })}
        onClick={() => onMove(index, index + 1)}
      >
        <ArrowDown aria-hidden />
      </Button>
    </li>
  );
}

/** “Columns”: pick the people list's columns and their order (saved per device). */
export function ColumnsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const columns = usePeopleColumns();
  const defs = useColumnDefs(columns);
  const byId = new Map(defs.map((def) => [def.id, def]));
  const chosen = columns.filter((id) => byId.has(id));
  const others = defs.filter((def) => !chosen.includes(def.id));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = (from: number, to: number) => setPeopleColumns(arrayMove(chosen, from, to));

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    move(chosen.indexOf(active.id as PeopleColumn), chosen.indexOf(over.id as PeopleColumn));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('people.columns.title')} className="flex max-h-[80dvh] flex-col">
        <p className="mb-3 text-meta text-muted-foreground">{t('people.columns.lead')}</p>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <div className="flex items-center gap-2 border-b border-border-strong py-2 pl-6 font-semibold">
            {t('people.columns.name')}
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={chosen} strategy={verticalListSortingStrategy}>
              <ul aria-label={t('people.columns.title')}>
                {chosen.map((id, index) => (
                  <ChosenRow
                    key={id}
                    def={byId.get(id)!}
                    index={index}
                    count={chosen.length}
                    onMove={move}
                    onHide={() => setPeopleColumns(chosen.filter((c) => c !== id))}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <ul className="mt-3">
            {others.map((def) => (
              <li key={def.id} className="border-b py-1 pl-6">
                <label className="flex cursor-pointer items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => setPeopleColumns([...chosen, def.id])}
                    aria-label={t('people.columns.show', { column: def.label })}
                  />
                  <span>{def.label}</span>
                  {def.id === 'space' && (
                    <span className="text-meta text-muted-foreground">
                      {t('people.columns.onlyAllSpaces')}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex justify-between gap-2">
          <Button variant="secondary" onClick={() => setPeopleColumns(null)}>
            {t('people.columns.reset')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('people.columns.done')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
