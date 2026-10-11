import { useId, type ReactElement, type ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { Label } from '@/components/ui/label';

interface FormFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** A single input element; it receives id and aria attributes. */
  children: ReactElement;
}

export function FormField({ label, hint, error, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Slot.Root id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy}>
        {children}
      </Slot.Root>
      {error ? (
        <p id={errorId} className="text-[0.78125rem] text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-meta text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** Form-level error or success line. */
export function FormMessage({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: ReactNode;
}) {
  if (!children) return null;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-foreground-2'}
    >
      {children}
    </p>
  );
}
