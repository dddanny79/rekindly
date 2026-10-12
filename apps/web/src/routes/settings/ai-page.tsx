import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProvider, AiSettings } from '@app/shared';
import { FormField, FormMessage } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { aiApi, aiSettingsQuery } from '@/lib/ai';
import { spacesQuery, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { spaceName } from '@/lib/labels';

const PRESETS = [
  { label: 'LM Studio', url: 'http://localhost:1234/v1' },
  { label: 'Ollama', url: 'http://localhost:11434/v1' },
  { label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
];

function AiForm({ settings }: { settings: AiSettings }) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<AiProvider>(settings.provider);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl ?? '');
  const [model, setModel] = useState(settings.model ?? '');
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const save = useWrite(aiApi.save, {
    invalidate: [['ai']],
    onSuccess: (next) => {
      setSaved(true);
      setApiKey('');
      setModel(next.model ?? '');
    },
  });
  const test = useWrite(aiApi.test, { invalidate: [] });

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    test.reset();
    save.mutate({
      provider,
      ...(provider === 'openai' ? { baseUrl } : {}),
      ...(provider !== 'off' && model.trim() ? { model } : {}),
      ...(apiKey ? { apiKey } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={t('ai.settingsTitle')}>
      <SegmentedControl
        label={t('ai.provider')}
        value={provider}
        onChange={(value) => {
          setProvider(value);
          setSaved(false);
        }}
        options={[
          { value: 'off', label: t('ai.providers.off') },
          { value: 'openai', label: t('ai.providers.openai') },
          { value: 'anthropic', label: t('ai.providers.anthropic') },
        ]}
      />
      {provider === 'openai' && (
        <>
          <FormField label={t('ai.baseUrl')} hint={t('ai.baseUrlHint')}>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://192.168.1.20:1234/v1"
            />
          </FormField>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => setBaseUrl(p.url)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </>
      )}
      {provider !== 'off' && (
        <>
          <FormField
            label={t('ai.model')}
            hint={provider === 'openai' ? t('ai.modelHint') : undefined}
          >
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === 'anthropic' ? 'claude-sonnet-5-5' : 'qwen3-8b'}
            />
          </FormField>
          <FormField label={provider === 'openai' ? t('ai.apiKeyOptional') : t('ai.apiKey')}>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings.hasApiKey ? t('backup.keptSecret') : ''}
              autoComplete="new-password"
            />
          </FormField>
        </>
      )}
      <FormMessage tone="error">{save.isError && errorMessage(t, save.error)}</FormMessage>
      <FormMessage tone="error">{test.isError && errorMessage(t, test.error)}</FormMessage>
      {saved && !save.isError && <p className="text-sm text-foreground-2">{t('backup.saved')}</p>}
      {test.isSuccess && (
        <p className="text-sm text-foreground-2" role="status">
          {t('ai.testOk', { reply: test.data.reply.slice(0, 80) })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          {t('common.save')}
        </Button>
        {settings.provider !== 'off' && (
          <Button
            type="button"
            variant="secondary"
            disabled={test.isPending}
            onClick={() => test.mutate(undefined)}
          >
            {test.isPending ? t('backup.testing') : t('backup.test')}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Settings › AI: provider (off, local/OpenAI-compatible, Anthropic) and what it may see. */
export function AiSettingsPage() {
  const { t } = useTranslation();
  const { data: settings } = useQuery(aiSettingsQuery);
  const { data: spaces = [] } = useQuery(spacesQuery);
  const allowed = spaces.filter((s) => s.aiAllowed);
  return (
    <>
      <SettingsSection title={t('ai.settingsTitle')} lead={t('ai.settingsLead')}>
        {settings && (
          <>
            {settings.provider !== 'off' && (
              <p className="mb-3 text-sm" role="status">
                {settings.cloud
                  ? t('ai.statusCloud', { target: settings.target })
                  : t('ai.statusLocal', { target: settings.target })}
              </p>
            )}
            <AiForm key={settings.provider} settings={settings} />
          </>
        )}
      </SettingsSection>
      <SettingsSection title={t('ai.spacesTitle')}>
        <p className="text-sm">
          {allowed.length
            ? t('apiTokens.mcpSpaces', { spaces: allowed.map((s) => spaceName(t, s)).join(', ') })
            : t('ai.noSpaces')}{' '}
          <Link to="/settings/spaces" className="underline">
            {t('apiTokens.mcpSpacesLink')}
          </Link>
        </p>
        <p className="mt-2 text-meta text-foreground-2">{t('ai.spacesHint')}</p>
      </SettingsSection>
    </>
  );
}
