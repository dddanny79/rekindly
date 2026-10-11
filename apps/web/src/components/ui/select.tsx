import { ChevronDown } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Native select in the input style (keeps mobile pickers and accessibility). */
export function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select
        className="h-9.5 w-full cursor-pointer appearance-none rounded-sm border border-input bg-popover pr-8 pl-2.5 text-base text-foreground hover:border-foreground-2 focus-visible:border-foreground disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
