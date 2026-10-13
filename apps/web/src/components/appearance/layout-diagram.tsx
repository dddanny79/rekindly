import type { ResolvedLayout } from '@app/shared';
import { cn } from '@/lib/utils';

/** Small schematic of a person-page layout: one bar per visible section. */
export function LayoutDiagram({ layout }: { layout: ResolvedLayout }) {
  const visible = layout.sections.filter((s) => !s.hidden);
  const bar = (id: string) => (
    <span
      key={id}
      className={cn(
        'block rounded-[1px]',
        id === 'briefing'
          ? 'h-2.5 bg-signal/70'
          : id === 'timeline'
            ? 'h-5 bg-foreground-2/50'
            : 'h-1.5 bg-muted-foreground/45',
      )}
    />
  );
  return (
    <div aria-hidden className="h-20 overflow-hidden rounded-sm border bg-popover p-2">
      <span className="mb-1.5 block h-2 w-1/2 rounded-[1px] bg-foreground" />
      {layout.columns === 2 ? (
        <div
          className={cn(
            'grid gap-1.5',
            layout.sideWidth === 'wide' ? 'grid-cols-2' : 'grid-cols-[2fr_1fr]',
          )}
        >
          <div className="flex flex-col gap-1">
            {visible.filter((s) => s.column === 'main').map((s) => bar(s.id))}
          </div>
          <div className="flex flex-col gap-1 border-l pl-1.5">
            {visible.filter((s) => s.column === 'side').map((s) => bar(s.id))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">{visible.map((s) => bar(s.id))}</div>
      )}
    </div>
  );
}
