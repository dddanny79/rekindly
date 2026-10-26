import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Address } from '@app/shared';
import { FormMessage } from '@/components/form-field';
import { EditButton, RemoveButton } from '@/components/row-actions';
import { EmptyRow, SideRow, SideSection } from '@/components/side-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { formatAddress } from '@/lib/format';
import { mapLinks } from '@/lib/maps';

type AddressInput = Omit<Address, 'id'>;
const EMPTY: AddressInput = {
  label: null,
  street: null,
  zip: null,
  city: null,
  region: null,
  country: null,
};

function AddressForm({
  initial,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  initial?: Address;
  onSubmit: (input: AddressInput) => void;
  onCancel: () => void;
  pending: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AddressInput>(initial ?? EMPTY);
  const field = (key: keyof AddressInput, className = '') => (
    <Input
      aria-label={t(`address.${key}`)}
      placeholder={t(`address.${key}`)}
      value={form[key] ?? ''}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      className={className}
      autoFocus={key === 'street'}
    />
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(form);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-b py-3">
      {field('label')}
      {field('street')}
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
        {field('zip')}
        {field('city')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {field('region')}
        {field('country')}
      </div>
      <FormMessage tone="error">{error ? errorMessage(t, error) : null}</FormMessage>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {t('common.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** “Map” and “Directions” for an address, opened in the device's maps app. */
function MapLinksRow({ address }: { address: Address }) {
  const { t } = useTranslation();
  const links = mapLinks(address);
  if (!links) return null;
  const text = formatAddress(address).join(', ');
  const external = (href: string) =>
    href.startsWith('https:') ? { target: '_blank', rel: 'noreferrer' } : {};
  return (
    <div className="mt-0.5 flex gap-3 text-meta">
      <a
        href={links.map}
        {...external(links.map)}
        aria-label={t('address.mapFor', { address: text })}
        className="text-foreground-2 underline"
      >
        {t('address.map')}
      </a>
      <a
        href={links.route}
        {...external(links.route)}
        aria-label={t('address.routeFor', { address: text })}
        className="text-foreground-2 underline"
      >
        {t('address.route')}
      </a>
    </div>
  );
}

/** Addresses of a person or an organization. */
export function AddressesSection({
  addresses,
  api,
}: {
  addresses: Address[];
  api: {
    add: (input: AddressInput) => Promise<unknown>;
    update: (id: string, input: AddressInput) => Promise<unknown>;
    remove: (id: string) => Promise<unknown>;
  };
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const add = useWrite(api.add, { onSuccess: () => setAdding(false) });
  const update = useWrite(
    ({ id, input }: { id: string; input: AddressInput }) => api.update(id, input),
    {
      onSuccess: () => setEditing(null),
    },
  );
  const remove = useWrite(api.remove);

  return (
    <SideSection
      title={t('address.title')}
      addLabel={t('address.add')}
      onAdd={() => setAdding(true)}
    >
      {addresses.length === 0 && !adding && <EmptyRow>{t('address.empty')}</EmptyRow>}
      {addresses.map((address) =>
        editing === address.id ? (
          <AddressForm
            key={address.id}
            initial={address}
            pending={update.isPending}
            error={update.error}
            onCancel={() => setEditing(null)}
            onSubmit={(input) => update.mutate({ id: address.id, input })}
          />
        ) : (
          <SideRow
            key={address.id}
            actions={
              <>
                <EditButton label={t('address.edit')} onClick={() => setEditing(address.id)} />
                <RemoveButton
                  label={t('address.remove')}
                  title={t('address.removeTitle')}
                  onConfirm={() => remove.mutate(address.id)}
                />
              </>
            }
          >
            {address.label && (
              <div className="text-meta text-muted-foreground">{address.label}</div>
            )}
            <address className="not-italic">
              {formatAddress(address).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </address>
            <MapLinksRow address={address} />
          </SideRow>
        ),
      )}
      {adding && (
        <AddressForm
          pending={add.isPending}
          error={add.error}
          onCancel={() => setAdding(false)}
          onSubmit={(input) => add.mutate(input)}
        />
      )}
    </SideSection>
  );
}
