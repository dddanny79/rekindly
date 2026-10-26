import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrganizationMember } from '@app/shared';
import { AddressesSection } from '@/components/addresses-section';
import { Avatar } from '@/components/avatar';
import { Combobox } from '@/components/combobox';
import { CustomFieldsSection } from '@/components/custom-fields';
import { InlineText } from '@/components/inline-edit';
import { CreateOrganizationDialog } from '@/components/organization/create-organization-dialog';
import { EmptyRow, SideSection } from '@/components/side-section';
import { Timeline } from '@/components/timeline/timeline';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { organizationQuery, organizationsApi, organizationsQuery, useWrite } from '@/lib/data';
import { formatPartialDate } from '@/lib/dates';
import { ORGANIZATION_KINDS, webDisplay, webHref } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { spaceColor, spaceName } from '@/lib/labels';
import { useSelectedSpace } from '@/lib/space-selection';
import { NotFoundPage } from '@/routes/not-found-page';

const route = getRouteApi('/app/organizations/$organizationId');

function Members({ members, former = false }: { members: OrganizationMember[]; former?: boolean }) {
  const { t, i18n } = useTranslation();
  const { spaces } = useSelectedSpace();
  const locale = i18n.resolvedLanguage ?? 'en';
  return (
    <ul>
      {members.map((m) => (
        <li key={m.affiliationId} className="flex items-center gap-3 border-b py-2">
          <Avatar
            initials={m.person.initials}
            photoUrl={m.person.photoUrl}
            color={spaces.find((s) => s.id === m.person.spaceId)?.color}
            size={30}
          />
          <div className="min-w-0 flex-1">
            <Link
              to="/people/$personId"
              params={{ personId: m.person.id }}
              className={former ? 'text-foreground-2 underline' : 'font-semibold underline'}
            >
              {m.person.displayName}
            </Link>
            {m.role && <div className="text-sm text-foreground-2">{m.role}</div>}
          </div>
          {(m.startedOn || m.endedOn) && (
            <span className="num shrink-0 text-meta text-muted-foreground">
              {m.startedOn ? formatPartialDate(m.startedOn, locale) : '…'} –{' '}
              {m.endedOn ? formatPartialDate(m.endedOn, locale) : t('affiliation.today')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function OrganizationPage(): ReactElement {
  const { organizationId } = route.useParams();
  // Fresh state (dialogs, drafts) for every organization.
  return <OrganizationView key={organizationId} organizationId={organizationId} />;
}

function OrganizationView({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { spaces } = useSelectedSpace();
  const query = useQuery(organizationQuery(organizationId));
  const org = query.data;
  const { data: siblings = [] } = useQuery({
    ...organizationsQuery({ spaceId: org?.spaceId }),
    enabled: !!org,
  });
  const [addingChild, setAddingChild] = useState(false);

  const update = useWrite((patch: Record<string, unknown>) =>
    organizationsApi.update(organizationId, patch),
  );
  const remove = useWrite(() => organizationsApi.remove(organizationId), {
    onSuccess: () => void navigate({ to: '/organizations' }),
  });

  // Possible parents: same space, not this organization or anything below it.
  const parentOptions = useMemo(() => {
    if (!org) return [];
    const below = new Set([org.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const o of siblings) {
        if (o.parentId && below.has(o.parentId) && !below.has(o.id)) {
          below.add(o.id);
          grew = true;
        }
      }
    }
    return siblings.filter((o) => !below.has(o.id)).map((o) => ({ value: o.id, label: o.name }));
  }, [org, siblings]);

  if (query.isError) return <NotFoundPage />;
  if (!org) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  const space = spaces.find((s) => s.id === org.spaceId);

  return (
    <article className="min-w-0">
      <nav aria-label={t('common.breadcrumb')} className="mb-3 text-meta text-muted-foreground">
        <Link to="/organizations" className="no-underline hover:underline">
          {t('nav.organizations')}
        </Link>
        {org.path.slice(0, -1).map((step) => (
          <span key={step.id}>
            <span aria-hidden> / </span>
            <Link
              to="/organizations/$organizationId"
              params={{ organizationId: step.id }}
              className="no-underline hover:underline"
            >
              {step.name}
            </Link>
          </span>
        ))}
      </nav>

      <header className="rule-double pb-4">
        <div className="kicker flex flex-wrap gap-x-2.5 text-muted-foreground">
          {space && <span style={{ color: spaceColor(space.color) }}>{spaceName(t, space)}</span>}
          {org.kind && (
            <span>{t(`organizations.kinds.${org.kind}` as never, { defaultValue: org.kind })}</span>
          )}
        </div>
        <h1 className="mt-0.5 font-serif text-title md:text-display">
          <InlineText
            label={t('organizations.name')}
            value={org.name}
            validate={(v) => (v.trim() ? null : t('validation.required'))}
            onSave={(name) => update.mutateAsync({ name })}
            className="font-serif"
            inputClassName="h-auto py-1 font-serif text-title"
          />
        </h1>
        {org.website && (
          <a
            href={webHref(org.website)}
            target="_blank"
            rel="noreferrer"
            className="text-foreground-2 underline"
          >
            {webDisplay(org.website)}
          </a>
        )}
      </header>

      <div className="grid min-w-0 gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <div className="mt-7 min-w-0">
          <SideSection title={t('organizations.currentPeople')}>
            {org.currentMembers.length ? (
              <Members members={org.currentMembers} />
            ) : (
              <EmptyRow>{t('organizations.noPeople')}</EmptyRow>
            )}
          </SideSection>
          {org.formerMembers.length > 0 && (
            <div className="mt-7">
              <SideSection title={t('organizations.formerPeople')}>
                <Members members={org.formerMembers} former />
              </SideSection>
            </div>
          )}
          <div className="mt-7">
            <SideSection
              title={t('organizations.children')}
              addLabel={t('organizations.createChild')}
              onAdd={() => setAddingChild(true)}
            >
              {org.children.length === 0 && <EmptyRow>{t('organizations.noChildren')}</EmptyRow>}
              <ul>
                {org.children.map((child) => (
                  <li key={child.id} className="border-b py-2">
                    <Link
                      to="/organizations/$organizationId"
                      params={{ organizationId: child.id }}
                      className="underline"
                    >
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </SideSection>
          </div>
          <Timeline organizationId={org.id} />
          <div className="mt-7">
            <SideSection title={t('organizations.notes')}>
              <div className="py-2">
                <InlineText
                  label={t('organizations.notes')}
                  value={org.notes}
                  multiline
                  onSave={(notes) => update.mutateAsync({ notes })}
                  className="font-serif text-read"
                />
              </div>
            </SideSection>
          </div>
        </div>

        <aside aria-label={t('person.sidebar')} className="mt-7 min-w-0 lg:border-l lg:pl-7">
          <SideSection title={t('person.details')}>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-x-3 border-b py-1.5">
              <span className="text-meta text-muted-foreground">{t('organizations.kind')}</span>
              <Select
                aria-label={t('organizations.kind')}
                value={org.kind ?? ''}
                onChange={(e) => update.mutate({ kind: e.target.value || null })}
              >
                <option value="">–</option>
                {ORGANIZATION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`organizations.kinds.${k}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-x-3 border-b py-1.5">
              <span className="text-meta text-muted-foreground">{t('organizations.website')}</span>
              <InlineText
                label={t('organizations.website')}
                value={org.website}
                display={org.website ? webDisplay(org.website) : undefined}
                href={org.website ? webHref(org.website) : undefined}
                onSave={(website) => update.mutateAsync({ website })}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-x-3 border-b py-1.5">
              <span className="text-meta text-muted-foreground">{t('organizations.parent')}</span>
              {org.parentId ? (
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <Link
                    to="/organizations/$organizationId"
                    params={{ organizationId: org.parentId }}
                    className="truncate underline"
                  >
                    {org.path.at(-2)?.name}
                  </Link>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t('organizations.removeParent')}
                    onClick={() => update.mutate({ parentId: null })}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              ) : (
                <Combobox
                  label={t('organizations.parent')}
                  placeholder={t('common.choose')}
                  options={parentOptions}
                  onSelect={(o) => update.mutate({ parentId: o.value })}
                />
              )}
            </div>
            {update.isError && (
              <p className="py-1 text-[0.78125rem] text-destructive">
                {errorMessage(t, update.error)}
              </p>
            )}
          </SideSection>
          <div className="mt-7">
            <CustomFieldsSection
              target="organization"
              values={org.fields}
              onSave={(definitionId, value) =>
                organizationsApi.setField(org.id, definitionId, value)
              }
            />
          </div>
          <div className="mt-7">
            <AddressesSection
              addresses={org.addresses}
              api={{
                add: (input) => organizationsApi.addAddress(org.id, input),
                update: (id, input) => organizationsApi.updateAddress(org.id, id, input),
                remove: (id) => organizationsApi.removeAddress(org.id, id),
              }}
            />
          </div>
          <div className="mt-9">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost">
                  <Trash2 aria-hidden />
                  {t('organizations.delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('organizations.deleteTitle', { name: org.name })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>{t('organizations.deleteBody')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel variant="secondary">{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => remove.mutate(undefined)}>
                    {t('organizations.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </aside>
      </div>
      <CreateOrganizationDialog
        open={addingChild}
        onOpenChange={setAddingChild}
        parentId={org.id}
        parentSpaceId={org.spaceId}
      />
    </article>
  );
}
