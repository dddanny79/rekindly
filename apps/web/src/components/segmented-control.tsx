import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

/** Radio group drawn as joined segments (design: Today space filter, appearance). */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'grid auto-cols-fr grid-flow-col overflow-hidden rounded-sm border border-border-strong text-sm',
        className,
      )}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'h-10 cursor-pointer px-3.5 focus-visible:-outline-offset-4 md:h-9',
              index > 0 && 'border-l border-border-strong',
              checked
                ? 'bg-foreground font-bold text-background'
                : 'text-foreground hover:bg-muted',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
