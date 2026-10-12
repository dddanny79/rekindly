import { useQuery } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateAppPasswordResponse } from '@app/shared';
import { FormField, FormMessage } from '@/components/form-field';
import { RemoveButton } from '@/components/row-actions';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { appPasswordsApi, appPasswordsQuery, spacesQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { spaceName } from '@/lib/labels';

const KEYS = [['app-passwords']];

function CopyValue({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2">
      <div className="min-w-0">
        <div className="text-meta text-muted-foreground">{label}</div>
        <div data-copy-value className="num text-base font-semibold tracking-wide break-all">
          {value}
        </div>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t('sync.copy', { what: label })}
        onClick={() =>
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}

/** Shown once after creating a password: what to type into the phone. */
function Credentials({
  created,
  onDone,
}: {
  created: CreateAppPasswordResponse;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 rounded-sm border border-border-strong p-4" role="status">
      <p className="font-semibold">{t('sync.created', { name: created.appPassword.name })}</p>
      <p className="mt-1 text-meta text-muted-foreground">{t('sync.onlyOnce')}</p>
      <div className="mt-2">
        <CopyValue label={t('sync.server')} value={created.server} />
        <CopyValue label={t('sync.username')} value={created.username} />
        <CopyValue label={t('sync.password')} value={created.password} />
      </div>
      <h3 className="kicker mt-5">{t('sync.iphone.title')}</h3>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-foreground-2">
        <li>{t('sync.iphone.step1')}</li>
        <li>{t('sync.iphone.step2')}</li>
        <li>{t('sync.iphone.step3')}</li>
        <li>{t('sync.iphone.step4')}</li>
      </ol>
      <p className="mt-3 text-meta text-muted-foreground">
        {t('sync.otherClients', { url: created.url })}
      </p>
      <Button className="mt-4" variant="secondary" onClick={onDone}>
        {t('sync.done')}
      </Button>
    </div>
  );
}

/** Settings › Sync: app passwords for the iPhone address book (CardDAV). */
export function SyncSettingsPage() {
  const { t, i18n } = useTranslation();
  const { data: passwords = [] } = useQuery(appPasswordsQuery);
  const { data: spaces = [] } = useQuery(spacesQuery);
  const [name, setName] = useState('iPhone');
  const [allSpaces, setAllSpaces] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [created, setCreated] = useState<CreateAppPasswordResponse | null>(null);
  const create = useWrite(appPasswordsApi.create, { invalidate: KEYS, onSuccess: setCreated });
  const remove = useWrite(appPasswordsApi.remove, { invalidate: KEYS });
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  const spacesOf = (ids: string[] | null) =>
    ids
      ? ids
          .map((id) => spaces.find((s) => s.id === id))
          .filter((s) => !!s)
          .map((s) => spaceName(t, s))
          .join(', ')
      : t('spaces.all');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || (!allSpaces && !chosen.length)) return;
    create.mutate({ name: name.trim(), spaceIds: allSpaces ? null : chosen });
  }

  return (
    <>
      <SettingsSection title={t('sync.title')} lead={t('sync.lead')}>
        {passwords.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('sync.empty')}</p>
        )}
        <ul>
          {passwords.map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-b py-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{p.name}</div>
                <div className="num text-meta text-muted-foreground">
                  {spacesOf(p.spaceIds)} ·{' '}
                  {t('sync.createdAt', { date: date.format(new Date(p.createdAt)) })}
                  {' · '}
                  {p.lastUsedAt
                    ? t('sync.lastUsed', { date: date.format(new Date(p.lastUsedAt)) })
                    : t('sync.neverUsed')}
                </div>
              </div>
              <RemoveButton
                label={t('sync.revokeNamed', { name: p.name })}
                title={t('sync.revokeTitle', { name: p.name })}
                description={t('sync.revokeBody')}
                onConfirm={() => remove.mutate(p.id)}
              />
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title={t('sync.new')}>
        {created ? (
          <Credentials created={created} onDone={() => setCreated(null)} />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <FormField label={t('sync.name')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </FormField>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">{t('sync.spaces')}</legend>
              <label className="flex items-center gap-2 py-1 text-sm">
                <input type="radio" checked={allSpaces} onChange={() => setAllSpaces(true)} />
                {t('sync.allSpaces')}
              </label>
              <label className="flex items-center gap-2 py-1 text-sm">
                <input type="radio" checked={!allSpaces} onChange={() => setAllSpaces(false)} />
                {t('sync.someSpaces')}
              </label>
              {!allSpaces && (
                <div className="ml-6 flex flex-col">
                  {spaces.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={chosen.includes(s.id)}
                        onChange={(e) =>
                          setChosen((list) =>
                            e.target.checked ? [...list, s.id] : list.filter((id) => id !== s.id),
                          )
                        }
                      />
                      {spaceName(t, s)}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <FormMessage tone="error">
              {create.isError && errorMessage(t, create.error)}
            </FormMessage>
            <Button
              type="submit"
              className="self-start"
              disabled={create.isPending || !name.trim() || (!allSpaces && !chosen.length)}
            >
              {t('sync.create')}
            </Button>
          </form>
        )}
      </SettingsSection>
    </>
  );
}
