import {
  CalendarDays,
  MessageSquare,
  NotebookPen,
  Phone,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { EntryDirection, EntryKind } from '@app/shared';

export const KIND_ICONS: Record<EntryKind, LucideIcon> = {
  note: NotebookPen,
  call: Phone,
  meeting: Users,
  message: MessageSquare,
  event: CalendarDays,
};

/** ↗ outgoing, ↙ incoming (design). */
export const directionArrow = (direction: EntryDirection | null) =>
  direction === 'out' ? '↗ ' : direction === 'in' ? '↙ ' : '';
