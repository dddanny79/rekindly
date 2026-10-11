import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Space } from '@app/shared';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { spaceColor, spaceName } from '@/lib/labels';
import { ALL_SPACES, setSelectedSpace, useSelectedSpace } from '@/lib/space-selection';
import { cn } from '@/lib/utils';

function useOptions() {
  const { t } = useTranslation();
  const { spaces, selected } = useSelectedSpace();
  const total = spaces.reduce((sum, space) => sum + space.peopleCount, 0);
  return {
    selected,
    options: [
      { id: ALL_SPACES, label: t('spaces.all'), color: null as string | null, count: total },
      ...spaces.map((space: Space) => ({
        id: space.id,
        label: spaceName(t, space),
        color: spaceColor(space.color),
        count: space.peopleCount,
      })),
    ],
  };
}

/** Keys 0–9 pick a space on desktop (0 = all), unless typing in a field. */
function useSpaceShortcuts(ids: string[]) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!/^[0-9]$/.test(event.key)) return;
      const id = ids[Number(event.key)];
      if (id) setSelectedSpace(id);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ids]);
}

/** Desktop sidebar: radio list with colour dots and counts. */
export function SpaceSwitcherList() {
  const { t } = useTranslation();
  const { selected, options } = useOptions();
  useSpaceShortcuts(options.map((o) => o.id));

  return (
    <div>
      <h2 className="kicker mb-1.5 px-2.5 text-muted-foreground">{t('spaces.label')}</h2>
      <div role="radiogroup" aria-label={t('spaces.label')} className="flex flex-col gap-0.5">
        {options.map((option, index) => {
          const checked = option.id === selected;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setSelectedSpace(option.id)}
              className={cn(
                'flex h-8 cursor-pointer items-center gap-2.5 px-2.5 text-left hover:bg-muted',
                checked ? 'font-bold text-foreground' : 'text-foreground-2',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  !option.color && 'border-[1.5px] border-foreground',
                )}
                style={option.color ? { background: option.color } : undefined}
              />
              <span className="flex-1 truncate">{option.label}</span>
              <span className="kbd" aria-hidden>
                {index}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Mobile top bar: button that opens a bottom sheet. */
export function SpaceSwitcherSheet() {
  const { t } = useTranslation();
  const { selected, options } = useOptions();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === selected) ?? options[0]!;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={`${t('spaces.label')}: ${current.label}`}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-border-strong px-2.5 text-sm font-bold"
        >
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: current.color ?? 'var(--foreground)' }}
          />
          <span className="max-w-32 truncate">{current.label}</span>
          <ChevronDown aria-hidden className="size-3.5" />
        </button>
      </SheetTrigger>
      <SheetContent title={t('spaces.label')}>
        <div
          role="radiogroup"
          aria-label={t('spaces.label')}
          className="border-t border-border-strong"
        >
          {options.map((option) => {
            const checked = option.id === selected;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => {
                  setSelectedSpace(option.id);
                  setOpen(false);
                }}
                className="flex min-h-13.5 w-full cursor-pointer items-center gap-3.5 border-b text-left"
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-4.5 shrink-0 rounded-full',
                    checked
                      ? 'border-[5px] border-foreground'
                      : 'border-[1.5px] border-muted-foreground',
                  )}
                />
                <span className={cn('flex flex-1 items-center gap-2', checked && 'font-bold')}>
                  {option.color && (
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: option.color }}
                    />
                  )}
                  {option.label}
                </span>
                <span className="num text-meta text-muted-foreground">{option.count}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-meta text-muted-foreground">{t('spaces.hint')}</p>
      </SheetContent>
    </Sheet>
  );
}
