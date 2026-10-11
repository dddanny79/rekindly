import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AddressesSection } from '@/components/addresses-section';
import { CustomFieldsSection } from '@/components/custom-fields';
import { AffiliationsSection } from '@/components/person/affiliations';
import { ContactPointsSection } from '@/components/person/contact-points';
import { DetailsSection, MetSection } from '@/components/person/details';
import { PersonHeader } from '@/components/person/person-header';
import { RelationshipsSection } from '@/components/person/relationships';
import { TagsSection } from '@/components/person/tags';
import { peopleApi, personQuery } from '@/lib/data';
import { useSelectedSpace } from '@/lib/space-selection';
import { NotFoundPage } from '@/routes/not-found-page';

const route = getRouteApi('/app/people/$personId');

/** Empty placeholder blocks for the briefing and the timeline (task 03). */
function Placeholder({ title, children }: { title: string; children: string }) {
  return (
    <section aria-label={title} className="mt-6">
      <h2 className="kicker border-b border-border-strong pb-1">{title}</h2>
      <p className="py-3 font-serif text-read text-muted-foreground italic">{children}</p>
    </section>
  );
}

export function PersonPage(): ReactElement {
  const { personId } = route.useParams();
  // Fresh state (open forms, drafts) for every person.
  return <PersonView key={personId} personId={personId} />;
}

function PersonView({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const { spaces } = useSelectedSpace();
  const query = useQuery(personQuery(personId));

  if (query.isError) return <NotFoundPage />;
  if (!query.data) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  const person = query.data;
  const space = spaces.find((s) => s.id === person.spaceId);

  return (
    <article className="min-w-0">
      <nav aria-label={t('common.breadcrumb')} className="mb-3 text-meta text-muted-foreground">
        <Link to="/people" className="no-underline hover:underline">
          {t('nav.people')}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-foreground-2">{person.displayName}</span>
      </nav>

      <PersonHeader person={person} space={space} />

      <div className="grid min-w-0 gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <div className="min-w-0">
          <Placeholder title={t('person.briefing')}>{t('person.briefingSoon')}</Placeholder>
          <div className="mt-6 lg:hidden">
            <ContactPointsSection personId={person.id} points={person.contactPoints} />
          </div>
          <Placeholder title={t('person.timeline')}>{t('person.timelineSoon')}</Placeholder>
        </div>

        <aside aria-label={t('person.sidebar')} className="mt-6 min-w-0 lg:border-l lg:pl-7">
          <div className="hidden lg:block">
            <ContactPointsSection personId={person.id} points={person.contactPoints} />
          </div>
          <div className="mt-7 lg:mt-7">
            <RelationshipsSection
              personId={person.id}
              personName={person.displayName}
              relationships={person.relationships}
            />
          </div>
          <div className="mt-7">
            <AffiliationsSection
              personId={person.id}
              spaceId={person.spaceId}
              affiliations={person.affiliations}
            />
          </div>
          <div className="mt-7">
            <DetailsSection person={person} />
          </div>
          <div className="mt-7">
            <CustomFieldsSection
              target="person"
              values={person.fields}
              onSave={(definitionId, value) => peopleApi.setField(person.id, definitionId, value)}
            />
          </div>
          <div className="mt-7">
            <AddressesSection
              addresses={person.addresses}
              api={{
                add: (input) => peopleApi.addItem(person.id, 'addresses', input),
                update: (id, input) => peopleApi.updateItem(person.id, 'addresses', id, input),
                remove: (id) => peopleApi.removeItem(person.id, 'addresses', id),
              }}
            />
          </div>
          <div className="mt-7">
            <MetSection person={person} />
          </div>
          <div className="mt-7">
            <TagsSection personId={person.id} tags={person.tags} />
          </div>
        </aside>
      </div>
    </article>
  );
}
