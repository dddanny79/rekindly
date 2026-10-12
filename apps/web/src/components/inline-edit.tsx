import { Pencil } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface InlineTextProps {
  /** Accessible name of the field, e.g. “Birthday”. */
  label: string;
  value: string | null;
  /** Text in the field when editing starts, if it differs from `value` (e.g. 24.10.1985). */
  editValue?: string | null;
  /** Shown instead of the value (e.g. formatted date). */
  display?: ReactNode;
  placeholder?: string;
  /** Returns an error message, or null if the input is fine. */
  validate?: (input: string) => string | null;
  onSave: (input: string) => Promise<unknown>;
  multiline?: boolean;
  className?: string;
  inputClassName?: string;
}

/**
 * Click (or Enter) to edit in place; Enter/blur saves, Escape cancels.
 * Design: no form pages, edit where the value is.
 */
export function InlineText({
  label,
  value,
  editValue,
  display,
  placeholder,
  validate,
  onSave,
  multiline = false,
  className,
  inputClassName,
}: InlineTextProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  const start = () => {
    setDraft(editValue ?? value ?? '');
    setError(null);
    setEditing(true);
  };
  const stop = () => {
    setEditing(false);
    requestAnimationFrame(() => button.current?.focus());
  };

  async function save() {
    if (saving) return;
    if (draft.trim() === (editValue ?? value ?? '').trim()) return stop();
    const problem = validate?.(draft) ?? null;
    if (problem) return setError(problem);
    setSaving(true);
    try {
      await onSave(draft);
      stop();
    } catch {
      setError(t('errors.unknown'));
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      stop();
    } else if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    }
  }

  if (editing) {
    const shared = {
      'aria-label': label,
      'aria-invalid': error ? true : undefined,
      value: draft,
      autoFocus: true,
      disabled: saving,
      onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
      onKeyDown,
      onBlur: () => void save(),
    };
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        {multiline ? (
          <textarea
            {...shared}
            rows={4}
            className={cn(
              'w-full rounded-sm border border-foreground bg-popover px-2.5 py-2 text-base outline-2 outline-offset-1 outline-ring',
              inputClassName,
            )}
          />
        ) : (
          <Input {...shared} placeholder={placeholder} className={inputClassName} />
        )}
        {error && <p className="text-[0.78125rem] text-destructive">{error}</p>}
      </div>
    );
  }

  const empty = !value;
  return (
    <button
      ref={button}
      type="button"
      onClick={start}
      aria-label={`${label}: ${empty ? t('common.empty') : (editValue ?? value)}. ${t('common.edit')}`}
      className={cn(
        'group -mx-1 flex max-w-full cursor-text items-baseline gap-2 rounded-sm px-1 text-left hover:bg-muted',
        empty && 'text-muted-foreground',
        className,
      )}
    >
      <span className={cn('min-w-0', multiline && 'whitespace-pre-wrap')}>
        {empty ? (placeholder ?? t('common.add')) : (display ?? value)}
      </span>
      <Pencil
        aria-hidden
        className="size-3.5 shrink-0 self-center text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </button>
  );
}
