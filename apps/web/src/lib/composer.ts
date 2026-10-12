import type { EntryDirection, EntryKind } from '@app/shared';
import { parseDueInput } from '@/lib/dates';

/** Slash commands of the timeline input (English and German aliases). */
const KIND_COMMANDS: Record<string, EntryKind> = {
  call: 'call',
  anruf: 'call',
  telefonat: 'call',
  meeting: 'meeting',
  treffen: 'meeting',
  note: 'note',
  notiz: 'note',
  message: 'message',
  msg: 'message',
  nachricht: 'message',
  event: 'event',
  ereignis: 'event',
};
const DIRECTION_COMMANDS: Record<string, EntryDirection> = {
  in: 'in',
  ein: 'in',
  out: 'out',
  aus: 'out',
};
const REMINDER_COMMANDS = new Set(['wv', 'remind', 'followup']);

export interface ParsedCommands {
  text: string;
  kind?: EntryKind;
  direction?: EntryDirection;
  /** Follow-up due date (`YYYY-MM-DD`). */
  reminderDueOn?: string;
  /** Removed character ranges `[start, end)` in the input. */
  removed: [number, number][];
}

/**
 * Consumes completed slash commands (known command, followed by a space) anywhere in
 * the text: "/call /in Text" → kind call, direction in; "… /wv 2w " → follow-up.
 * Unknown or unfinished commands are left in the text.
 */
export function parseCommands(input: string, today = new Date()): ParsedCommands {
  const result: ParsedCommands = { text: input, removed: [] };
  const pattern = /(^|[ \t\n])\/([a-zäöü]+)(?=[ \t])/gi;
  for (const match of input.matchAll(pattern)) {
    const command = match[2]!.toLowerCase();
    const start = match.index + match[1]!.length;
    let end = start + 1 + match[2]!.length;
    if (KIND_COMMANDS[command]) result.kind = KIND_COMMANDS[command];
    else if (DIRECTION_COMMANDS[command]) result.direction = DIRECTION_COMMANDS[command];
    else if (REMINDER_COMMANDS.has(command)) {
      const arg = /^[ \t]+(\S+)(?=[ \t])/.exec(input.slice(end));
      const due = arg ? parseDueInput(arg[1]!, today) : null;
      if (!arg || !due) continue;
      result.reminderDueOn = due;
      end += arg[0].length;
    } else continue;
    // Also swallow the space after the command.
    result.removed.push([start, end + 1]);
  }
  for (const [start, end] of [...result.removed].reverse()) {
    result.text = result.text.slice(0, start) + result.text.slice(end);
  }
  return result;
}

/** The `@query` right before the caret, if the user is typing a mention. */
export function mentionAt(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([\p{L}\p{N}'’-]*(?: [\p{L}\p{N}'’-]*)?)$/u.exec(before);
  if (!match) return null;
  return { query: match[2]!, start: before.length - match[2]!.length - 1 };
}
