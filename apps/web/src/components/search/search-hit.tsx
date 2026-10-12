import { Building2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  findTokenRanges,
  type SearchMatch,
  type SearchResult,
  searchTokens,
  type SpaceColor,
} from '@app/shared';
import { Avatar } from '@/components/avatar';
import { relatedToText } from '@/lib/labels';
import { cn } from '@/lib/utils';

/** Text with `<mark>`ed ranges (search hits, design: `signal-tint`). */
export function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start < at || end > text.length) continue;
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

/** Highlights the query words in a text the server did not mark (names, subtitles). */
export function HighlightQuery({ text, query }: { text: string; query: string }) {
  return <Highlighted text={text} ranges={findTokenRanges(text, searchTokens(query))} />;
}

function useMatchLabel() {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  return (match: SearchMatch) => {
    if (match.entry) {
      return `${t(`timeline.kinds.${match.entry.kind}`)} · ${date.format(new Date(match.entry.occurredAt))}`;
    }
    if (match.field === 'field' && match.label) return match.label;
    const field = t(`search.fields.${match.field}`);
    return match.label ? `${field} · ${match.label}` : field;
  };
}

/** “Why did this match?”: field and excerpt of the best non-name matches. */
export function MatchLines({ matches, max = 2 }: { matches: SearchMatch[]; max?: number }) {
  const label = useMatchLabel();
  const shown = matches.filter((m) => m.field !== 'name').slice(0, max);
  if (!shown.length) return null;
  return (
    <span className="mt-0.5 flex flex-col gap-0.5">
      {shown.map((match, index) => (
        <span key={index} className="line-clamp-2 text-meta text-foreground-2">
          <span className="font-semibold text-muted-foreground">{label(match)}:</span>{' '}
          <Highlighted text={match.text} ranges={match.highlights} />
        </span>
      ))}
    </span>
  );
}

/** One search result: avatar or icon, highlighted name, subtitle, match lines. */
export function SearchHit({
  result,
  query,
  color,
  compact = false,
}: {
  result: SearchResult;
  query: string;
  color: SpaceColor | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const name = result.type === 'person' ? result.person.displayName : result.organization.name;
  const subtitle =
    result.type === 'person'
      ? result.relatedTo
        ? relatedToText(t, result.relatedTo)
        : result.subtitle
      : result.organization.path
          .slice(0, -1)
          .map((p) => p.name)
          .join(' › ') || null;
  return (
    <span className="flex min-w-0 flex-1 items-start gap-3">
      {result.type === 'person' ? (
        <Avatar
          initials={result.person.initials}
          photoUrl={result.person.photoUrl}
          color={color}
          size={compact ? 28 : 34}
          className="mt-0.5"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex shrink-0 items-center justify-center rounded-full border border-border-strong text-foreground-2',
            compact ? 'size-7' : 'size-8.5',
          )}
        >
          <Building2 className="size-3.5" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">
          <span className="font-semibold">
            <HighlightQuery text={name || t('people.unnamed')} query={query} />
          </span>
          {subtitle && (
            <span className="text-meta text-muted-foreground">
              {' · '}
              <HighlightQuery text={subtitle} query={query} />
            </span>
          )}
          {result.type === 'person' && result.archived && (
            <span className="text-meta text-muted-foreground"> · {t('search.archived')}</span>
          )}
        </span>
        <MatchLines
          // Role or organization already shown in the subtitle say nothing new.
          matches={result.matches.filter((m) => m.field === 'entry' || !subtitle?.includes(m.text))}
          max={compact ? 1 : 2}
        />
      </span>
    </span>
  );
}
