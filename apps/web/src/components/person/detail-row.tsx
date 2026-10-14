import type { ReactNode } from 'react';

/** A label and its value, one line of a details list. */
export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-x-3 border-b py-1.5">
      <span className="text-meta text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
