import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, Star } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersonListItem } from '@app/shared';
import { Avatar } from '@/components/avatar';
import { PageHeader } from '@/components/page-header';
import { CreatePersonDialog } from '@/components/person/create-person-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { duplicatesQuery, organizationsQuery, peopleQuery, tagsQuery } from '@/lib/data';
import { useSelectedSpace } from '@/lib/space-selection';
import { useSessionState } from '@/lib/session-state';
import { useKeyShortcut } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

interface PeopleFilters {
  q?: string;
  tag?: string;
  org?: string;
  favorite?: boolean;
  archived?: boolean;
  /** Show indirect contacts instead of contacts. */
  indirect?: boolean;
  sort?: 'updated' | 'lastContact';
}

function useRelativeDate() {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  return (iso: string | null) => (iso ? format.format(new Date(iso)) : '–');
}

function roleLine(person: PersonListItem) {
  if (person.role && person.organization) return `${person.role} @ ${person.organization.name}`;
  return person.organization?.name ?? person.role ?? person.summary ?? '';
}

export function PeoplePage(): ReactElement {
  const { t } = useTranslation();
  const { data: duplicates = [] } = useQuery(duplicatesQuery);
  const [search, setFilters] = useSessionState<PeopleFilters>('people-filters', {});
  const { spaceId, spaces } = useSelectedSpace();
  const [creating, setCreating] = useState(false);
  const formatDate = useRelativeDate();

  const people = useQuery(
    peopleQuery({
      spaceId,
      q: search.q,
      tagId: search.tag,
      organizationId: search.org,
      favorite: search.favorite ? 'true' : undefined,
      archived: search.archived ? 'true' : undefined,
      listed: search.indirect ? 'indirect' : undefined,
      sort: search.sort,
    }),
  );
  const { data: tags = [] } = useQuery(tagsQuery);
  const { data: organizations = [] } = useQuery(organizationsQuery({ spaceId }));
  const colorOf = (id: string) => spaces.find((s) => s.id === id)?.color ?? null;

  const setSearch = (patch: Partial<PeopleFilters>) => setFilters({ ...search, ...patch });

  useKeyShortcut(
    'n',
    useCallback(() => setCreating(true), []),
  );

  const list = people.data ?? [];

  return (
    <>
      <PageHeader
        title={t('nav.people')}
        actions={
          <div className="flex items-center gap-3">
            {duplicates.length > 0 && (
              <Link to="/duplicates" className="text-meta text-signal">
                {t('duplicates.link', { count: duplicates.length })}
              </Link>
            )}
            <span className="num text-meta text-muted-foreground" aria-live="polite">
              {t('people.count', { count: list.length })}
            </span>
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              {t('people.create.button')}
              <span className="kbd border-background/40 text-background/80" aria-hidden>
                N
              </span>
            </Button>
          </div>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
        <Input
          type="search"
          aria-label={t('people.filter.name')}
          placeholder={t('people.filter.name')}
          defaultValue={search.q}
          onChange={(e) => setSearch({ q: e.target.value || undefined })}
          className="col-span-2 md:w-60"
        />
        <Select
          aria-label={t('people.filter.tag')}
          value={search.tag ?? ''}
          onChange={(e) => setSearch({ tag: e.target.value || undefined })}
          className="md:w-40"
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
          onChange={(e) => setSearch({ org: e.target.value || undefined })}
          className="md:w-48"
        >
          <option value="">{t('people.filter.allOrganizations')}</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('people.sort.label')}
          value={search.sort ?? 'name'}
          onChange={(e) =>
            setSearch({
              sort: e.target.value === 'name' ? undefined : (e.target.value as 'updated'),
            })
          }
          className="md:w-44"
        >
          <option value="name">{t('people.sort.name')}</option>
          <option value="updated">{t('people.sort.updated')}</option>
          <option value="lastContact">{t('people.sort.lastContact')}</option>
        </Select>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            aria-pressed={!!search.favorite}
            onClick={() => setSearch({ favorite: search.favorite ? undefined : true })}
            className={cn('flex-1', search.favorite && 'border-foreground bg-muted font-semibold')}
          >
            <Star aria-hidden className={cn(search.favorite && 'fill-current')} />
            {t('people.filter.favorites')}
          </Button>
          <Button
            variant="secondary"
            aria-pressed={!!search.indirect}
            onClick={() => setSearch({ indirect: search.indirect ? undefined : true })}
            className={cn('flex-1', search.indirect && 'border-foreground bg-muted font-semibold')}
          >
            {t('people.filter.indirect')}
          </Button>
          <Button
            variant="secondary"
            aria-pressed={!!search.archived}
            onClick={() => setSearch({ archived: search.archived ? undefined : true })}
            className={cn('flex-1', search.archived && 'border-foreground bg-muted font-semibold')}
          >
            {t('people.filter.archived')}
          </Button>
        </div>
      </div>

      {people.isSuccess && list.length === 0 ? (
        <div className="mt-10 max-w-md">
          <p className="font-serif text-read">
            {search.q ||
            search.tag ||
            search.org ||
            search.favorite ||
            search.archived ||
            search.indirect
              ? t('people.emptyFiltered')
              : t('people.empty')}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <table className="mt-5 hidden w-full border-collapse text-left md:table">
            <thead>
              <tr className="border-b border-border-strong">
                <th className="kicker py-1.5 pr-3 font-bold">{t('people.columns.name')}</th>
                <th className="kicker py-1.5 pr-3 font-bold">{t('people.columns.role')}</th>
                <th className="kicker py-1.5 pr-3 font-bold">{t('people.columns.tags')}</th>
                <th className="kicker py-1.5 pr-3 text-right font-bold">
                  {search.sort === 'updated'
                    ? t('people.columns.updated')
                    : t('people.columns.lastContact')}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((person) => (
                <tr key={person.id} className="border-b hover:bg-muted">
                  <td className="py-2 pr-3">
                    <Link
                      to="/people/$personId"
                      params={{ personId: person.id }}
                      className="flex items-center gap-3 no-underline"
                    >
                      <Avatar
                        initials={person.initials}
                        photoUrl={person.photoUrl}
                        color={colorOf(person.spaceId)}
                      />
                      <span className="font-semibold">
                        {person.displayName || t('people.unnamed')}
                      </span>
                      {person.favorite && (
                        <Star
                          aria-label={t('people.favorite')}
                          className="size-3.5 fill-current text-signal"
                        />
                      )}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-foreground-2">{roleLine(person)}</td>
                  <td className="py-2 pr-3 text-meta text-muted-foreground">
                    {person.tags.map((tag) => `#${tag.name}`).join(' ')}
                  </td>
                  <td className="num py-2 pr-3 text-right text-meta text-muted-foreground">
                    {formatDate(
                      search.sort === 'updated' ? person.updatedAt : person.lastContactAt,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: list */}
          <ul className="mt-3 md:hidden">
            {list.map((person) => (
              <li key={person.id}>
                <Link
                  to="/people/$personId"
                  params={{ personId: person.id }}
                  className="flex min-h-[54px] items-center gap-3.5 border-b py-2 no-underline"
                >
                  <Avatar
                    initials={person.initials}
                    photoUrl={person.photoUrl}
                    color={colorOf(person.spaceId)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {person.displayName || t('people.unnamed')}
                      {person.favorite && (
                        <Star
                          aria-label={t('people.favorite')}
                          className="ml-1.5 inline size-3.5 fill-current text-signal"
                        />
                      )}
                    </span>
                    <span className="block truncate text-meta text-muted-foreground">
                      {roleLine(person)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <CreatePersonDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
