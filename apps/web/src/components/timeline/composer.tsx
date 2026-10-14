import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DIRECTED_KINDS,
  ENTRY_KINDS,
  type EntryDirection,
  type EntryKind,
  foldText,
  type PersonRef,
} from '@app/shared';
import { Avatar } from '@/components/avatar';
import { FormMessage } from '@/components/form-field';
import { directionArrow } from '@/components/timeline/entry-kind';
import { Select } from '@/components/ui/select';
import { mentionAt, parseCommands } from '@/lib/composer';
import {
  entriesApi,
  peopleQuery,
  questionsApi,
  spacesQuery,
  TIMELINE_KEYS,
  useWrite,
} from '@/lib/data';
import { addDays, fromDateOnly, toDateOnly, toDateTimeLocal } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

const REMINDER_PRESETS = [1, 7, 14, 30] as const;

interface ComposerProps {
  /** The person whose page this is; always linked. */
  person: PersonRef;
  /** Start with this kind and focus the field (e.g. “Log a call” in the command palette). */
  initialKind?: EntryKind;
}

/**
 * One field for notes, calls, meetings: slash commands set the kind, `@Name` links
 * more people, `/ask …` keeps a question for next time, Enter saves (Shift+Enter: new
 * line).
 */
export function TimelineComposer({ person, initialKind }: ComposerProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<EntryKind>(initialKind ?? 'note');
  const [direction, setDirection] = useState<EntryDirection>('out');
  const [when, setWhen] = useState<string | null>(null);
  const [others, setOthers] = useState<PersonRef[]>([]);
  const [reminder, setReminder] = useState<string | null>(null);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  // Caret to restore right after React rendered a changed text (before the next key).
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    textarea.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  const { data: people = [] } = useQuery(peopleQuery({}));
  const { data: spaces = [] } = useQuery(spacesQuery);
  const colorOf = (spaceId: string) => spaces.find((s) => s.id === spaceId)?.color;

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = foldText(mention.query);
    const taken = new Set([person.id, ...others.map((o) => o.id)]);
    return people
      .filter((p) => !taken.has(p.id) && foldText(p.displayName).includes(q))
      .slice(0, 6);
  }, [mention, people, person.id, others]);

  const create = useWrite(entriesApi.create, { invalidate: TIMELINE_KEYS });
  const ask = useWrite(
    async (texts: string[]) => {
      for (const text of texts) await questionsApi.create(person.id, { text });
    },
    { invalidate: [['people'], ['search']] },
  );

  function reset() {
    setText('');
    setKind('note');
    setDirection('out');
    setWhen(null);
    setOthers([]);
    setReminder(null);
  }

  // Commands stay visible while typing (so the text never shifts under the caret);
  // they take effect immediately and are removed when saving.
  const commands = useMemo(() => parseCommands(`${text} `), [text]);
  const effectiveKind = commands.kind ?? kind;
  const effectiveDirection = commands.direction ?? direction;
  const effectiveReminder = commands.reminderDueOn ?? reminder;

  /** Applies typed commands to the controls and removes them from the text. */
  function materialize() {
    if (commands.kind) setKind(commands.kind);
    if (commands.direction) setDirection(commands.direction);
    if (commands.reminderDueOn) setReminder(commands.reminderDueOn);
    // Questions stay in the text until saving, so they never vanish while typing.
    if (commands.removed.length && !commands.questions.length) {
      setText(commands.text.replace(/ $/, ''));
    }
  }

  function onChange(value: string, caret: number) {
    setText(value);
    setMention(mentionAt(value, caret));
    setActive(0);
  }

  function pick(p: (typeof people)[number]) {
    if (!mention) return;
    const caret = mention.start + 1 + mention.query.length;
    const next = `${text.slice(0, mention.start)}${p.displayName} ${text.slice(caret)}`;
    setText(next);
    setOthers((current) => [
      ...current,
      {
        id: p.id,
        displayName: p.displayName,
        initials: p.initials,
        spaceId: p.spaceId,
        photoUrl: p.photoUrl,
      },
    ]);
    setMention(null);
    pendingCaret.current = mention.start + p.displayName.length + 1;
    textarea.current?.focus();
  }

  function submit() {
    // "… Thomas Albers ." → "… Thomas Albers." (mentions insert a trailing space).
    const body = commands.text.replace(/ +([.,;:!?])/g, '$1').trim();
    const questions = commands.questions;
    if (!body && !questions.length) return;
    const draft = { text, kind, direction, when, others, reminder };
    // Clear right away so the next note can be typed; restore the draft on error.
    reset();
    if (questions.length) {
      ask.mutate(questions, { onError: () => setText((current) => current || draft.text) });
    }
    if (!body) return;
    create.mutate(
      {
        kind: effectiveKind,
        direction: (DIRECTED_KINDS as readonly string[]).includes(effectiveKind)
          ? effectiveDirection
          : null,
        occurredAt: when ? new Date(when).toISOString() : undefined,
        bodyMd: body,
        personIds: [person.id, ...others.map((o) => o.id)],
        ...(effectiveReminder ? { reminder: { dueOn: effectiveReminder } } : {}),
      },
      {
        onError: () => {
          setText((current) => current || draft.text);
          setKind(draft.kind);
          setDirection(draft.direction);
          setWhen(draft.when);
          setOthers(draft.others);
          setReminder(draft.reminder);
        },
      },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && suggestions.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (i + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(suggestions[active]!);
        return;
      }
    }
    if (event.key === 'Escape') {
      if (mention) setMention(null);
      else textarea.current?.blur();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const directed = (DIRECTED_KINDS as readonly string[]).includes(kind);
  const reminderLabel = reminder
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
      }).format(fromDateOnly(reminder))
    : null;

  return (
    <div className="relative rounded-sm border border-border-strong bg-popover outline-offset-2 focus-within:outline-2 focus-within:outline-ring">
      <label htmlFor="timeline-input" className="sr-only">
        {t('timeline.input')}
      </label>
      <textarea
        id="timeline-input"
        ref={textarea}
        rows={text.includes('\n') ? 4 : 2}
        autoFocus={!!initialKind}
        value={text}
        placeholder={t('timeline.placeholder')}
        onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        role="combobox"
        aria-expanded={!!mention && suggestions.length > 0}
        aria-controls="timeline-mentions"
        aria-autocomplete="list"
        aria-activedescendant={
          mention && suggestions.length ? `mention-${suggestions[active]?.id}` : undefined
        }
        className="block w-full resize-none bg-transparent px-3.5 pt-3 pb-1 font-serif text-[1.0625rem] outline-none placeholder:text-muted-foreground placeholder:italic"
      />

      {mention && suggestions.length > 0 && (
        <ul
          id="timeline-mentions"
          role="listbox"
          aria-label={t('timeline.mentionPeople')}
          className="absolute inset-x-2 top-full z-40 mt-1 rounded-sm border border-border-strong bg-popover py-1 shadow-overlay"
        >
          {suggestions.map((p, index) => (
            <li
              key={p.id}
              id={`mention-${p.id}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5',
                index === active && 'bg-muted',
              )}
            >
              <Avatar
                initials={p.initials}
                photoUrl={p.photoUrl}
                color={colorOf(p.spaceId)}
                size={24}
              />
              <span className="truncate">{p.displayName}</span>
              {p.organization && (
                <span className="truncate text-meta text-muted-foreground">
                  {p.organization.name}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2.5 pt-1 pb-2 text-meta">
        <Select
          aria-label={t('timeline.kind')}
          value={effectiveKind}
          onChange={(e) => {
            materialize();
            setKind(e.target.value as EntryKind);
          }}
          className="w-auto [&_select]:h-7 [&_select]:py-0 [&_select]:pl-2 [&_select]:text-meta [&_select]:font-semibold"
        >
          {ENTRY_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`timeline.kinds.${k}`)}
            </option>
          ))}
        </Select>
        {directed && (
          <button
            type="button"
            onClick={() => {
              materialize();
              setDirection(effectiveDirection === 'out' ? 'in' : 'out');
            }}
            className="h-7 cursor-pointer rounded-sm border border-input px-2 font-semibold hover:border-foreground"
            aria-label={t('timeline.directionToggle')}
          >
            {directionArrow(effectiveDirection)}
            {t(`timeline.direction.${effectiveDirection}`)}
          </button>
        )}
        <input
          type="datetime-local"
          aria-label={t('timeline.when')}
          value={when ?? toDateTimeLocal(new Date())}
          onChange={(e) => setWhen(e.target.value || null)}
          className={cn(
            'num h-7 rounded-sm border border-transparent px-1 hover:border-input',
            !when && 'text-muted-foreground',
          )}
        />
        <Select
          aria-label={t('timeline.reminder')}
          value={effectiveReminder ?? ''}
          onChange={(e) => {
            materialize();
            setReminder(e.target.value || null);
          }}
          className="w-auto [&_select]:h-7 [&_select]:py-0 [&_select]:pl-2 [&_select]:text-meta"
        >
          <option value="">{t('timeline.noReminder')}</option>
          {REMINDER_PRESETS.map((days) => {
            const due = toDateOnly(addDays(new Date(), days));
            return (
              <option key={days} value={due}>
                {t(`timeline.reminderIn.d${days}`)}
              </option>
            );
          })}
          {reminder &&
            !REMINDER_PRESETS.some((d) => toDateOnly(addDays(new Date(), d)) === reminder) && (
              <option value={reminder}>{t('timeline.reminderOn', { date: reminderLabel })}</option>
            )}
        </Select>
        {commands.questions.length > 0 && (
          <span
            className="flex h-7 items-center rounded-sm border px-2"
            data-testid="composer-questions"
          >
            {t('questions.title')} · {commands.questions.length}
          </span>
        )}
        {others.map((o) => (
          <span key={o.id} className="flex h-7 items-center gap-1 rounded-sm border px-2">
            {t('timeline.with')} {o.displayName}
            <button
              type="button"
              onClick={() => setOthers((list) => list.filter((x) => x.id !== o.id))}
              aria-label={t('tags.removeNamed', { name: o.displayName })}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <span className="ml-auto hidden text-muted-foreground lg:inline">{t('timeline.hint')}</span>
        <button
          type="button"
          onClick={submit}
          disabled={!commands.text.trim() && !commands.questions.length}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-sm px-2 font-semibold text-foreground-2 hover:bg-muted disabled:cursor-default disabled:opacity-50"
        >
          <span className="kbd">↵</span>
          {t('common.save')}
        </button>
      </div>
      <div className="px-3 pb-2 empty:hidden">
        <FormMessage tone="error">
          {(create.isError && errorMessage(t, create.error)) ||
            (ask.isError && errorMessage(t, ask.error))}
        </FormMessage>
      </div>
    </div>
  );
}
