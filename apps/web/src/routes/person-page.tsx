import type { ReactElement, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { PersonSection } from '@app/shared';
import { AddressesSection } from '@/components/addresses-section';
import { CustomFieldsSection } from '@/components/custom-fields';
import { AffiliationsSection } from '@/components/person/affiliations';
import { BriefingCard } from '@/components/person/briefing';
import { ContactPointsSection } from '@/components/person/contact-points';
import { DetailsSection, MetSection } from '@/components/person/details';
import { FactsSection } from '@/components/person/facts';
import { PersonHeader } from '@/components/person/person-header';
import { RelationshipsSection } from '@/components/person/relationships';
import { TagsSection } from '@/components/person/tags';
import { TimelineComposer } from '@/components/timeline/composer';
import { Timeline } from '@/components/timeline/timeline';
import { useActiveAppearance, useMediaQuery } from '@/lib/appearance';
import { peopleApi, personQuery, recordPersonView } from '@/lib/data';
import { useSelectedSpace } from '@/lib/space-selection';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/routes/not-found-page';

const route = getRouteApi('/app/people/$personId');

export function PersonPage(): ReactElement {
  const { personId } = route.useParams();
  const { compose } = route.useSearch();
  // Fresh state (open forms, drafts) for every person and every “log a call”.
  return <PersonView key={`${personId}:${compose ?? ''}`} personId={personId} compose={compose} />;
}

function PersonView({ personId, compose }: { personId: string; compose?: 'call' }) {
  const { t } = useTranslation();
  const { spaces } = useSelectedSpace();
  const queryClient = useQueryClient();
  const query = useQuery(personQuery(personId));
  const { layout } = useActiveAppearance();
  // Two columns from the lg breakpoint on; below it every layout is one column.
  const wide = useMediaQuery('(min-width: 1024px)');

  // Remember the visit for “Recently viewed” on the Today page.
  const found = query.isSuccess;
  useEffect(() => {
    if (!found) return;
    void recordPersonView(personId).then(() =>
      queryClient.invalidateQueries({ queryKey: ['today'] }),
    );
  }, [found, personId, queryClient]);

  if (query.isError) return <NotFoundPage />;
  if (!query.data) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  const person = query.data;
  const space = spaces.find((s) => s.id === person.spaceId);

  const sections: Record<PersonSection, ReactNode> = {
    briefing: <BriefingCard person={person} />,
    contact: <ContactPointsSection personId={person.id} points={person.contactPoints} />,
    timeline: (
      <Timeline
        personId={person.id}
        composer={
          <TimelineComposer
            initialKind={compose}
            person={{
              id: person.id,
              displayName: person.displayName,
              initials: person.initials,
              spaceId: person.spaceId,
              photoUrl: person.photoUrl,
            }}
          />
        }
      />
    ),
    facts: <FactsSection personId={person.id} facts={person.facts} />,
    relationships: (
      <RelationshipsSection
        personId={person.id}
        personName={person.displayName}
        relationships={person.relationships}
      />
    ),
    organizations: (
      <AffiliationsSection
        personId={person.id}
        personName={person.displayName}
        spaceId={person.spaceId}
        affiliations={person.affiliations}
      />
    ),
    details: <DetailsSection person={person} />,
    fields: (
      <CustomFieldsSection
        target="person"
        values={person.fields}
        onSave={(definitionId, value) => peopleApi.setField(person.id, definitionId, value)}
      />
    ),
    addresses: (
      <AddressesSection
        addresses={person.addresses}
        api={{
          add: (input) => peopleApi.addItem(person.id, 'addresses', input),
          update: (id, input) => peopleApi.updateItem(person.id, 'addresses', id, input),
          remove: (id) => peopleApi.removeItem(person.id, 'addresses', id),
        }}
      />
    ),
    met: <MetSection person={person} />,
    tags: <TagsSection personId={person.id} tags={person.tags} />,
  };
  const visible = layout.sections.filter((s) => !s.hidden);
  const twoColumns = layout.columns === 2 && wide;
  // Briefing and timeline bring their own top margin; the other sections get the
  // spacing the side column always had.
  const render = (list: typeof visible, inSideColumn = false) =>
    list.map(({ id }, index) => (
      <div
        key={id}
        data-section={id}
        className={cn(
          id !== 'briefing' && id !== 'timeline' && (index > 0 ? 'mt-7' : !inSideColumn && 'mt-6'),
        )}
      >
        {sections[id]}
      </div>
    ));

  return (
    <article className="min-w-0">
      <nav
        aria-label={t('common.breadcrumb')}
        className="mb-3 hidden text-meta text-muted-foreground md:block"
      >
        <Link to="/people" className="no-underline hover:underline">
          {t('nav.people')}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-foreground-2">{person.displayName}</span>
      </nav>

      <PersonHeader person={person} space={space} />

      {twoColumns ? (
        <div
          className={cn(
            'grid min-w-0 gap-x-10',
            layout.sideWidth === 'wide'
              ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
              : 'grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]',
          )}
        >
          <div className="min-w-0">{render(visible.filter((s) => s.column === 'main'))}</div>
          <aside aria-label={t('person.sidebar')} className="mt-6 min-w-0 border-l pl-7">
            {render(
              visible.filter((s) => s.column === 'side'),
              true,
            )}
          </aside>
        </div>
      ) : (
        <div className="min-w-0">{render(visible)}</div>
      )}
    </article>
  );
}
