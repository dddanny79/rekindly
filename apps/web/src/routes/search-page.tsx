import { AskAi } from '@/components/ai/ask';
import type { ReactElement } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isSearchable, SEARCH_RESULT_TYPES, type SearchResult } from '@app/shared';
import { PageHeader } from '@/components/page-header';
import { SearchHit } from '@/components/search/search-hit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { organizationsQuery, searchQuery, tagsQuery } from '@/lib/data';
import { useDebounced } from '@/lib/palette';
import { useSelectedSpace } from '@/lib/space-selection';

const route = getRouteApi('/app/search');
const PAGE = 25;

function resultLink(result: SearchResult) {
  return result.type === 'person'
    ? ({ to: '/people/$personId', params: { personId: result.id } } as const)
    : ({ to: '/organizations/$organizationId', params: { organizationId: result.id } } as const);
}

/** Full search with filters; the query lives in the URL (?q=…) so it can be shared and reloaded. */
export function SearchPage(): ReactElement {
  const { t } = useTranslation();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const { spaceId, spaces } = useSelectedSpace();
  const [text, setText] = useState(search.q ?? '');
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(text.trim(), 200);
  // The URL changed from outside (e.g. “All results” in the command palette).
  const [seenQ, setSeenQ] = useState(search.q);
  if (search.q !== seenQ) {
    setSeenQ(search.q);
    if ((search.q ?? '') !== q) setText(search.q ?? '');
  }

  // Typing replaces the history entry instead of adding one per keystroke.
  useEffect(() => {
    if ((search.q ?? '') !== q)
      void navigate({ search: (s) => ({ ...s, q: q || undefined }), replace: true });
  }, [q, search.q, navigate]);

  const filters = { type: search.type, tagId: search.tag, organizationId: search.org, spaceId };
  // A new query or filter starts with the first page again.
  const filterKey = JSON.stringify([q, filters]);
  const [lastKey, setLastKey] = useState(filterKey);
  if (filterKey !== lastKey) {
    setLastKey(filterKey);
    setLimit(PAGE);
  }

  const searchable = isSearchable(q);
  const results = useQuery({
    ...searchQuery({ q, ...filters, limit }),
    enabled: searchable,
    placeholderData: keepPreviousData,
  });
  const { data: tags = [] } = useQuery(tagsQuery);
  const { data: organizations = [] } = useQuery(organizationsQuery({ spaceId }));
  const colorOf = (id: string) => spaces.find((s) => s.id === id)?.color ?? null;
  const setFilter = (patch: Partial<typeof search>) =>
    void navigate({ search: (s) => ({ ...s, ...patch }), replace: true });
  const list = searchable ? (results.data?.results ?? []) : [];

  return (
    <>
      <PageHeader title={t('nav.search')} />

      <div className="mt-4 flex flex-col gap-2">
        <AskAi />
        <Input
          type="search"
          aria-label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          className="h-11 font-serif text-lg md:max-w-xl"
        />
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          <Select
            aria-label={t('search.type')}
            value={search.type ?? ''}
            onChange={(e) =>
              setFilter({ type: (e.target.value || undefined) as typeof search.type })
            }
            className="col-span-2 md:w-60"
          >
            <option value="">{t('search.allTypes')}</option>
            {SEARCH_RESULT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`search.types.${type}`)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('people.filter.tag')}
            value={search.tag ?? ''}
            onChange={(e) => setFilter({ tag: e.target.value || undefined })}
            className="md:w-44"
          >
            <option value="">{t('people.filter.allTags')}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                #{tag.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('people.filter.organization')}
            value={search.org ?? ''}
            onChange={(e) => setFilter({ org: e.target.value || undefined })}
            className="md:w-56"
          >
            <option value="">{t('people.filter.allOrganizations')}</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-5 max-w-3xl" aria-live="polite">
        {!searchable ? (
          <p className="text-sm text-muted-foreground">
            {q ? t('search.minLength') : t('search.hint')}
          </p>
        ) : results.data && list.length === 0 ? (
          <p className="font-serif text-read">{t('search.noResults', { q })}</p>
        ) : results.data ? (
          <>
            <div className="flex items-baseline justify-between border-b border-border-strong pb-1">
              <span className="kicker">
                {results.data.hasMore
                  ? t('search.resultsMore', { count: list.length })
                  : t('search.results', { count: list.length })}
              </span>
              <span className="num text-meta text-muted-foreground">
                {t('search.took', { ms: results.data.tookMs })}
              </span>
            </div>
            <ul>
              {list.map((result) => (
                <li key={`${result.type}:${result.id}`}>
                  <Link
                    {...resultLink(result)}
                    className="flex items-start gap-3 border-b py-2.5 no-underline hover:bg-muted"
                  >
                    <SearchHit result={result} query={q} color={colorOf(result.spaceId)} />
                  </Link>
                </li>
              ))}
            </ul>
            {results.data.hasMore && limit < 100 && (
              <Button
                variant="secondary"
                className="mt-4"
                disabled={results.isFetching}
                onClick={() => setLimit((n) => Math.min(100, n + PAGE))}
              >
                {t('search.more')}
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('palette.searching')}</p>
        )}
      </div>
    </>
  );
}
