import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { foldText } from '@app/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Second line, e.g. the organization path. */
  hint?: string;
  icon?: ReactNode;
}

interface ComboboxProps {
  label: string;
  options: ComboboxOption[];
  onSelect: (option: ComboboxOption) => void;
  placeholder?: string;
  /** Offer “create …” for a query without exact match. */
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  /** Several “create …” variants (e.g. contact or indirect contact); first is the default. */
  createOptions?: { label: (query: string) => string; onCreate: (query: string) => void }[];
  autoFocus?: boolean;
  className?: string;
}

/** Type-to-filter picker (umlaut-insensitive) with keyboard navigation. */
export function Combobox({
  label,
  options,
  onSelect,
  placeholder,
  onCreate,
  createLabel,
  createOptions,
  autoFocus,
  className,
}: ComboboxProps) {
  const creators =
    createOptions ?? (onCreate ? [{ label: createLabel ?? ((q: string) => q), onCreate }] : []);
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = foldText(query.trim());
    const hits = q
      ? options.filter((o) => foldText(`${o.label} ${o.hint ?? ''}`).includes(q))
      : options;
    return hits.slice(0, 50);
  }, [options, query]);

  const canCreate =
    creators.length > 0 &&
    query.trim() !== '' &&
    !options.some((o) => foldText(o.label) === foldText(query.trim()));
  const total = filtered.length + (canCreate ? creators.length : 0);

  function choose(index: number) {
    if (index < filtered.length) onSelect(filtered[index]!);
    else if (canCreate) creators[index - filtered.length]?.onCreate(query.trim());
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (total ? (i + 1) % total : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (total ? (i - 1 + total) % total : 0));
    } else if (event.key === 'Enter' && open && total) {
      event.preventDefault();
      choose(Math.min(active, total - 1));
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  return (
    <div className={cn('relative', className)}>
      <Input
        ref={input}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && total ? optionId(Math.min(active, total - 1)) : undefined}
        placeholder={placeholder}
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {open && total > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-sm border border-border-strong bg-popover py-1 shadow-overlay"
        >
          {filtered.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5',
                index === active && 'bg-muted',
              )}
            >
              {option.icon}
              <span className="min-w-0">
                <span className="block truncate">{option.label}</span>
                {option.hint && (
                  <span className="block truncate text-meta text-muted-foreground">
                    {option.hint}
                  </span>
                )}
              </span>
            </li>
          ))}
          {canCreate &&
            creators.map((creator, i) => {
              const index = filtered.length + i;
              return (
                <li
                  key={`create-${i}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={active === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    'cursor-pointer px-2.5 py-1.5 text-foreground-2',
                    active === index && 'bg-muted',
                  )}
                >
                  {creator.label(query.trim())}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
