import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import {
  Building2,
  CalendarDays,
  ChevronRight,
  Phone,
  Search,
  Settings,
  Trash2,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive, VisuallyHidden } from 'radix-ui';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { foldText, isSearchable, type SearchResult } from '@app/shared';
import { Avatar } from '@/components/avatar';
import { CreateOrganizationDialog } from '@/components/organization/create-organization-dialog';
import { CreatePersonDialog } from '@/components/person/create-person-dialog';
import { SearchHit } from '@/components/search/search-hit';
import { searchQuery, todayQuery } from '@/lib/data';
import { toDateOnly } from '@/lib/dates';
import { relatedToText } from '@/lib/labels';
import { setPaletteOpen, useDebounced, usePaletteOpen } from '@/lib/palette';
import { useSelectedSpace } from '@/lib/space-selection';

const ITEM =
  'flex cursor-pointer items-center gap-3 px-3 py-2 data-[selected=true]:bg-muted data-[selected=true]:shadow-[inset_2px_0_0_var(--signal)]';
const GROUP =
  '[&_[cmdk-group-heading]]:kicker [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-muted-foreground';

function ActionItem({
  value,
  icon: Icon,
  onSelect,
  children,
  hint,
}: {
  value: string;
  icon: LucideIcon;
  onSelect: () => void;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <Command.Item value={value} onSelect={onSelect} className={ITEM}>
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center text-foreground-2"
      >
        <Icon className="size-4" />
      </span>
      <span className="flex-1 truncate">{children}</span>
      {hint && (
        <span className="kbd" aria-hidden>
          {hint}
        </span>
      )}
    </Command.Item>
  );
}

/**
 * ⌘K / Ctrl+K: jump to people and organizations, see why they matched, and run
 * actions (“New person”, “Log a call with …”). Search runs on the server.
 */
export function CommandPalette() {
  const { t } = useTranslation();
  const open = usePaletteOpen();
  const navigate = useNavigate();
  const { spaceId, spaces } = useSelectedSpace();
  const [query, setQuery] = useState('');
  // "call": pick the person to log a call with.
  const [mode, setMode] = useState<'root' | 'call'>('root');
  const [creating, setCreating] = useState<
    null | { kind: 'person'; name: string } | { kind: 'organization' }
  >(null);

  const debounced = useDebounced(query.trim(), 120);
  const searchable = isSearchable(debounced);
  const search = useQuery({
    ...searchQuery({
      q: debounced,
      spaceId,
      limit: 8,
      type: mode === 'call' ? 'person' : undefined,
    }),
    enabled: open && searchable,
    placeholderData: keepPreviousData,
  });
  const today = useQuery({
    ...todayQuery({ date: toDateOnly(new Date()), spaceId }),
    enabled: open && !query,
  });
  const results = searchable ? (search.data?.results ?? []) : [];
  const people = results.filter((r) => r.type === 'person');
  const organizations = results.filter((r) => r.type === 'organization');
  const colorOf = (id: string) => spaces.find((s) => s.id === id)?.color ?? null;

  function close() {
    setPaletteOpen(false);
    setQuery('');
    setMode('root');
  }

  function go(to: () => void) {
    close();
    to();
  }

  /** Opens the result; with `compose`, the person page starts a call entry. */
  function openResult(result: SearchResult, compose = mode === 'call') {
    go(() => {
      if (result.type === 'person') {
        void navigate({
          to: '/people/$personId',
          params: { personId: result.id },
          search: compose ? { compose: 'call' } : {},
        });
      } else {
        void navigate({
          to: '/organizations/$organizationId',
          params: { organizationId: result.id },
        });
      }
    });
  }

  /** “Log a call with …”: the next step picks the person. */
  function startCall() {
    setMode('call');
    setQuery('');
  }

  function onKeyDown(event: KeyboardEvent) {
    // Backspace in the empty field leaves the "Log a call" step.
    if (mode !== 'root' && event.key === 'Backspace' && !query) {
      event.preventDefault();
      setMode('root');
    }
  }

  const q = foldText(query.trim());
  const matches = (label: string) => !q || foldText(label).includes(q);
  const actions = [
    {
      value: 'action:new-person',
      icon: UserPlus,
      label: query.trim()
        ? t('palette.newPersonNamed', { name: query.trim() })
        : t('palette.newPerson'),
      run: () => go(() => setCreating({ kind: 'person', name: query.trim() })),
      always: true,
    },
    {
      value: 'action:log-call',
      icon: Phone,
      label: t('palette.logCall'),
      run: startCall,
    },
    {
      value: 'action:new-organization',
      icon: Building2,
      label: t('palette.newOrganization'),
      run: () => go(() => setCreating({ kind: 'organization' })),
    },
  ].filter((a) => a.always || matches(a.label));
  const destinations = (
    [
      { value: 'go:today', icon: CalendarDays, label: t('nav.today'), to: '/' },
      { value: 'go:people', icon: Users, label: t('nav.people'), to: '/people' },
      {
        value: 'go:organizations',
        icon: Building2,
        label: t('nav.organizations'),
        to: '/organizations',
      },
      { value: 'go:search', icon: Search, label: t('nav.search'), to: '/search' },
      { value: 'go:trash', icon: Trash2, label: t('nav.trash'), to: '/trash' },
      { value: 'go:settings', icon: Settings, label: t('nav.settings'), to: '/settings' },
    ] as const
  ).filter((d) => matches(d.label));

  const topPerson = people[0];
  const recent = !query && mode === 'root' ? (today.data?.recent ?? []).slice(0, 5) : [];

  // Items in display order; the first one is selected whenever it changes (new results).
  const root = mode === 'root';
  const order = [
    ...recent.map((r) => `recent:${r.person.id}`),
    ...people.map((r) => `person:${r.id}`),
    ...(root ? organizations.map((r) => `organization:${r.id}`) : []),
    ...(root && topPerson ? [`action:call:${topPerson.id}`] : []),
    ...(root ? actions.map((a) => a.value) : []),
    ...(root && searchable ? ['action:all-results'] : []),
    ...(root ? destinations.map((d) => d.value) : []),
  ];
  const first = order[0] ?? '';
  const [selected, setSelected] = useState(first);
  const [selectedFirst, setSelectedFirst] = useState(first);
  if (first !== selectedFirst) {
    setSelectedFirst(first);
    setSelected(first);
  }

  return (
    <>
      <DialogPrimitive.Root
        open={open}
        onOpenChange={(next) => (next ? setPaletteOpen(true) : close())}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed top-0 left-1/2 z-50 w-full -translate-x-1/2 border-border-strong bg-popover shadow-overlay md:top-[12vh] md:w-[calc(100%-2rem)] md:max-w-2xl md:rounded-sm md:border"
          >
            <VisuallyHidden.Root>
              <DialogPrimitive.Title>{t('palette.label')}</DialogPrimitive.Title>
            </VisuallyHidden.Root>
            <Command
              label={t('palette.label')}
              shouldFilter={false}
              loop
              value={selected}
              onValueChange={setSelected}
              onKeyDown={onKeyDown}
            >
              <div className="flex items-center gap-2.5 border-b border-border-strong px-3">
                {mode === 'call' ? (
                  <button
                    type="button"
                    onClick={() => setMode('root')}
                    className="flex cursor-pointer items-center gap-1 rounded-sm border px-1.5 py-0.5 text-meta font-semibold"
                    aria-label={t('palette.back')}
                  >
                    <Phone className="size-3" aria-hidden />
                    {t('timeline.kinds.call')}
                  </button>
                ) : (
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <Command.Input
                  // A new field per step, focused (clicking an item took the focus away).
                  key={mode}
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder={mode === 'call' ? t('palette.pickPerson') : t('palette.placeholder')}
                  className="h-13 flex-1 bg-transparent font-serif text-lg outline-none placeholder:text-muted-foreground placeholder:italic"
                />
                <span className="kbd hidden md:inline" aria-hidden>
                  Esc
                </span>
              </div>

              <Command.List className="max-h-[min(65vh,34rem)] overflow-y-auto overscroll-contain pb-1.5">
                {searchable && search.isFetching && !search.data && (
                  <Command.Loading>
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      {t('palette.searching')}
                    </p>
                  </Command.Loading>
                )}
                <Command.Empty className="px-3 py-3 text-sm text-muted-foreground">
                  {t('palette.empty')}
                </Command.Empty>

                {recent.length > 0 && (
                  <Command.Group heading={t('today.recent')} className={GROUP}>
                    {recent.map((r) => (
                      <Command.Item
                        key={r.person.id}
                        value={`recent:${r.person.id}`}
                        onSelect={() =>
                          go(
                            () =>
                              void navigate({
                                to: '/people/$personId',
                                params: { personId: r.person.id },
                              }),
                          )
                        }
                        className={ITEM}
                      >
                        <Avatar
                          initials={r.person.initials}
                          photoUrl={r.person.photoUrl}
                          color={colorOf(r.person.spaceId)}
                          size={28}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-semibold">{r.person.displayName}</span>
                          {(r.relatedTo || r.subtitle) && (
                            <span className="text-meta text-muted-foreground">
                              {' · '}
                              {r.relatedTo ? relatedToText(t, r.relatedTo) : r.subtitle}
                            </span>
                          )}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {people.length > 0 && (
                  <Command.Group heading={t('palette.people')} className={GROUP}>
                    {people.map((result) => (
                      <Command.Item
                        key={result.id}
                        value={`person:${result.id}`}
                        onSelect={() => openResult(result)}
                        className={ITEM}
                      >
                        <SearchHit
                          result={result}
                          query={debounced}
                          color={colorOf(result.spaceId)}
                          compact
                        />
                        <ChevronRight
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {mode === 'root' && organizations.length > 0 && (
                  <Command.Group heading={t('palette.organizations')} className={GROUP}>
                    {organizations.map((result) => (
                      <Command.Item
                        key={result.id}
                        value={`organization:${result.id}`}
                        onSelect={() => openResult(result)}
                        className={ITEM}
                      >
                        <SearchHit result={result} query={debounced} color={null} compact />
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {mode === 'root' && (
                  <Command.Group heading={t('palette.actions')} className={GROUP}>
                    {topPerson?.type === 'person' && (
                      <ActionItem
                        value={`action:call:${topPerson.id}`}
                        icon={Phone}
                        onSelect={() => openResult(topPerson, true)}
                      >
                        {t('palette.logCallWith', { name: topPerson.person.displayName })}
                      </ActionItem>
                    )}
                    {actions.map((action) => (
                      <ActionItem
                        key={action.value}
                        value={action.value}
                        icon={action.icon}
                        onSelect={action.run}
                      >
                        {action.label}
                      </ActionItem>
                    ))}
                    {searchable && (
                      <ActionItem
                        value="action:all-results"
                        icon={Search}
                        onSelect={() =>
                          go(() => void navigate({ to: '/search', search: { q: query.trim() } }))
                        }
                      >
                        {t('palette.allResults', { q: query.trim() })}
                      </ActionItem>
                    )}
                  </Command.Group>
                )}

                {mode === 'root' && destinations.length > 0 && (
                  <Command.Group heading={t('palette.go')} className={GROUP}>
                    {destinations.map((d) => (
                      <ActionItem
                        key={d.value}
                        value={d.value}
                        icon={d.icon}
                        onSelect={() => go(() => void navigate({ to: d.to }))}
                      >
                        {d.label}
                      </ActionItem>
                    ))}
                  </Command.Group>
                )}
              </Command.List>

              <div className="hidden items-center gap-4 border-t bg-muted px-3 py-1.5 text-meta text-muted-foreground md:flex">
                <span>
                  <span className="kbd">↑</span> <span className="kbd">↓</span>{' '}
                  {t('palette.navigate')}
                </span>
                <span>
                  <span className="kbd">↵</span> {t('palette.open')}
                </span>
                {mode !== 'root' && (
                  <span>
                    <span className="kbd">⌫</span> {t('palette.back')}
                  </span>
                )}
                <span>
                  <span className="kbd">Esc</span> {t('palette.close')}
                </span>
                {searchable && search.data && (
                  <span className="num ml-auto">
                    {t('search.took', { ms: search.data.tookMs })}
                  </span>
                )}
              </div>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <CreatePersonDialog
        open={creating?.kind === 'person'}
        initialName={creating?.kind === 'person' ? creating.name : undefined}
        onOpenChange={(next) => !next && setCreating(null)}
      />
      <CreateOrganizationDialog
        open={creating?.kind === 'organization'}
        onOpenChange={(next) => !next && setCreating(null)}
      />
    </>
  );
}
