import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Design: docs/design.md › States › Inputs.
        'h-9.5 w-full min-w-0 rounded-sm border border-input bg-popover px-2.5 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground hover:border-foreground-2',
        'focus-visible:border-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        'disabled:pointer-events-none disabled:border-border disabled:bg-muted disabled:text-muted-foreground',
        'aria-invalid:border-[1.5px] aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
