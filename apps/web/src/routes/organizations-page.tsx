import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { foldText, type OrganizationListItem } from '@app/shared';
import { CreateOrganizationDialog } from '@/components/organization/create-organization-dialog';
import { PageHeader } from '@/components/page-header';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { organizationsQuery } from '@/lib/data';
import { useKeyShortcut } from '@/lib/shortcuts';
import { useSelectedSpace } from '@/lib/space-selection';

type Node = OrganizationListItem & { children: Node[] };

function buildTree(items: OrganizationListItem[]): Node[] {
  const nodes = new Map(items.map((item) => [item.id, { ...item, children: [] as Node[] }]));
  const roots: Node[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function OrgLink({ org }: { org: OrganizationListItem }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2">
      <Link
        to="/organizations/$organizationId"
        params={{ organizationId: org.id }}
        className="min-w-0 truncate underline"
      >
        {org.name}
        {org.kind && (
          <span className="text-meta text-muted-foreground">
            {' '}
            · {t(`organizations.kinds.${org.kind}` as never, { defaultValue: org.kind })}
          </span>
        )}
      </Link>
      <span className="num shrink-0 text-meta text-muted-foreground">
        {t('organizations.people', { count: org.peopleCount })}
      </span>
    </div>
  );
}

function Tree({ nodes, depth = 0 }: { nodes: Node[]; depth?: number }) {
  return (
    <ul
      role={depth === 0 ? 'tree' : 'group'}
      className={depth > 0 ? 'ml-4 border-l pl-3' : undefined}
    >
      {nodes.map((node) => (
        <li
          key={node.id}
          role="treeitem"
          aria-expanded={node.children.length ? true : undefined}
          aria-selected={false}
        >
          <OrgLink org={node} />
          {node.children.length > 0 && <Tree nodes={node.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

export function OrganizationsPage() {
  const { t } = useTranslation();
  const { spaceId } = useSelectedSpace();
  const [view, setView] = useState<'tree' | 'list'>('tree');
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const { data: organizations = [], isSuccess } = useQuery(organizationsQuery({ spaceId }));
  useKeyShortcut(
    'n',
    useCallback(() => setCreating(true), []),
  );

  const filtered = useMemo(() => {
    const q = foldText(filter.trim());
    return q ? organizations.filter((o) => foldText(o.name).includes(q)) : organizations;
  }, [organizations, filter]);
  const tree = useMemo(() => buildTree(organizations), [organizations]);

  return (
    <>
      <PageHeader
        title={t('nav.organizations')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            {t('organizations.create')}
            <span className="kbd border-background/40 text-background/80" aria-hidden>
              N
            </span>
          </Button>
        }
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label={t('organizations.filter')}
          placeholder={t('organizations.filter')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full sm:w-60"
        />
        {!filter && (
          <SegmentedControl
            label={t('organizations.view')}
            value={view}
            options={[
              { value: 'tree', label: t('organizations.tree') },
              { value: 'list', label: t('organizations.list') },
            ]}
            onChange={setView}
          />
        )}
      </div>
      <div className="mt-4 max-w-2xl">
        {isSuccess && organizations.length === 0 && (
          <p className="font-serif text-read">{t('organizations.empty')}</p>
        )}
        {filter || view === 'list' ? (
          <ul>
            {filtered.map((org) => (
              <li key={org.id}>
                <OrgLink org={org} />
              </li>
            ))}
          </ul>
        ) : (
          <Tree nodes={tree} />
        )}
      </div>
      <CreateOrganizationDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
