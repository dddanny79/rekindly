import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_SLUG, type CreateApiTokenResponse } from '@app/shared';
import { CopyValue } from '@/components/copy-value';
import { FormField, FormMessage } from '@/components/form-field';
import { RemoveButton } from '@/components/row-actions';
import { SegmentedControl } from '@/components/segmented-control';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiTokensApi, apiTokensQuery, spacesQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { spaceName } from '@/lib/labels';

const EXPIRY = ['30', '90', '365', 'never'] as const;

function useDate() {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  return (iso: string) => format.format(new Date(iso));
}

/** Shown once after creating a token: the token and how to connect Claude. */
function CreatedToken({
  created,
  onDone,
}: {
  created: CreateApiTokenResponse;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const claudeCode = `claude mcp add --transport http ${APP_SLUG} ${created.mcpUrl} --header "Authorization: Bearer ${created.token}"`;
  const claudeDesktop = JSON.stringify(
    {
      mcpServers: {
        [APP_SLUG]: {
          command: 'npx',
          args: ['-y', 'mcp-remote', created.mcpUrl, '--header', 'Authorization:${AUTH_HEADER}'],
          env: { AUTH_HEADER: `Bearer ${created.token}` },
        },
      },
    },
    null,
    2,
  );
  return (
    <div className="mt-3 rounded-sm border border-border-strong p-4" role="status">
      <p className="font-semibold">{t('apiTokens.created', { name: created.apiToken.name })}</p>
      <p className="mt-1 text-meta text-muted-foreground">{t('apiTokens.onlyOnce')}</p>
      <div className="mt-2">
        <CopyValue label={t('apiTokens.token')} value={created.token} code />
        <CopyValue label={t('apiTokens.claudeCode')} value={claudeCode} code />
        <CopyValue label={t('apiTokens.claudeDesktop')} value={claudeDesktop} code />
      </div>
      <p className="mt-2 text-meta text-foreground-2">{t('apiTokens.desktopHint')}</p>
      <Button className="mt-3" variant="secondary" onClick={onDone}>
        {t('sync.done')}
      </Button>
    </div>
  );
}

/** Settings › API & MCP: tokens for own tools and AI assistants (Claude Code, Desktop). */
export function ApiSettingsPage() {
  const { t } = useTranslation();
  const date = useDate();
  const { data: tokens = [] } = useQuery(apiTokensQuery);
  const { data: spaces = [] } = useQuery(spacesQuery);
  const [name, setName] = useState('Claude');
  const [scope, setScope] = useState<'read' | 'write'>('read');
  const [expiry, setExpiry] = useState<(typeof EXPIRY)[number]>('365');
  const [created, setCreated] = useState<CreateApiTokenResponse | null>(null);
  const create = useWrite(apiTokensApi.create, {
    invalidate: [['api-tokens']],
    onSuccess: (result) => setCreated(result),
  });
  const remove = useWrite(apiTokensApi.remove, { invalidate: [['api-tokens']] });
  const allowed = spaces.filter((s) => s.aiAllowed);

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({
      name: name.trim(),
      scope,
      expiresInDays: expiry === 'never' ? null : Number(expiry),
    });
  }

  return (
    <>
      <SettingsSection title={t('apiTokens.mcpTitle')} lead={t('apiTokens.mcpLead')}>
        <p className="text-sm">
          {allowed.length
            ? t('apiTokens.mcpSpaces', { spaces: allowed.map((s) => spaceName(t, s)).join(', ') })
            : t('apiTokens.mcpNoSpaces')}{' '}
          <Link to="/settings/spaces" className="underline">
            {t('apiTokens.mcpSpacesLink')}
          </Link>
        </p>
        <p className="mt-2 text-sm">
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            {t('apiTokens.docs')}
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </p>
      </SettingsSection>

      <SettingsSection title={t('apiTokens.title')} lead={t('apiTokens.lead')}>
        {created ? (
          <CreatedToken created={created} onDone={() => setCreated(null)} />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3" aria-label={t('apiTokens.new')}>
            <FormField label={t('apiTokens.name')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </FormField>
            <div>
              <div className="mb-1.5 text-sm font-semibold">{t('apiTokens.scope')}</div>
              <SegmentedControl
                label={t('apiTokens.scope')}
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'read', label: t('apiTokens.scopes.read') },
                  { value: 'write', label: t('apiTokens.scopes.write') },
                ]}
              />
              <p className="mt-1 text-meta text-foreground-2">
                {t(`apiTokens.scopeHint.${scope}`)}
              </p>
            </div>
            <FormField label={t('apiTokens.expiry')}>
              <Select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value as typeof expiry)}
                className="max-w-xs"
              >
                {EXPIRY.map((value) => (
                  <option key={value} value={value}>
                    {t(`apiTokens.expiries.${value}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormMessage tone="error">
              {create.isError && errorMessage(t, create.error)}
            </FormMessage>
            <div>
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                {t('apiTokens.create')}
              </Button>
            </div>
          </form>
        )}

        <ul className="mt-5 border-t" aria-label={t('apiTokens.list')}>
          {tokens.length === 0 && (
            <li className="py-2 text-sm text-foreground-2">{t('apiTokens.none')}</li>
          )}
          {tokens.map((token) => {
            const expired = token.expiresAt && new Date(token.expiresAt) < new Date();
            return (
              <li key={token.id} className="flex items-center justify-between gap-3 border-b py-2">
                <div className="min-w-0 text-sm">
                  <div className="font-semibold">{token.name}</div>
                  <div className="text-foreground-2">
                    {[
                      t(`apiTokens.scopes.${token.scope}`),
                      token.expiresAt
                        ? t(expired ? 'apiTokens.expired' : 'apiTokens.expires', {
                            date: date(token.expiresAt),
                          })
                        : t('apiTokens.expiries.never'),
                      token.lastUsedAt
                        ? t('apiTokens.lastUsed', { date: date(token.lastUsedAt) })
                        : t('apiTokens.neverUsed'),
                    ].join(' · ')}
                  </div>
                </div>
                <RemoveButton
                  label={t('apiTokens.revokeNamed', { name: token.name })}
                  title={t('apiTokens.revokeTitle', { name: token.name })}
                  description={t('apiTokens.revokeBody')}
                  onConfirm={() => remove.mutate(token.id)}
                />
              </li>
            );
          })}
        </ul>
      </SettingsSection>
    </>
  );
}
