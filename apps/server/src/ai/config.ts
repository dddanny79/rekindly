import { eq } from 'drizzle-orm';
import type { AiSettings, AiSettingsInput } from '@app/shared';
import { openSecret, sealSecret } from '../backup/crypto';
import type { Db } from '../db/client';
import { settings } from '../db/schema';
import { DomainError } from '../lib/errors';

const KEY = 'ai.config';

interface Stored {
  provider: AiSettings['provider'];
  baseUrl: string | null;
  model: string | null;
  /** Sealed with the instance key (see `secretKey`). */
  apiKey: string | null;
}

/** What a provider call needs, with the API key opened. */
export interface AiConfig {
  provider: 'openai' | 'anthropic';
  baseUrl: string;
  model: string;
  apiKey: string | null;
}

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1';
export const DEFAULT_MODELS = { anthropic: 'claude-sonnet-5-5' } as const;

const read = (db: Db): Stored | null =>
  (db.select().from(settings).where(eq(settings.key, KEY)).get()?.value as Stored) ?? null;

/** Local network: localhost, private ranges, Tailscale (100.64/10), *.local. */
export function isLocalHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h === '::1' ||
    h.startsWith('fd') ||
    h.startsWith('fe80')
  )
    return true;
  const ip = h.split('.').map(Number);
  if (ip.length !== 4 || ip.some((n) => Number.isNaN(n))) return false;
  const [a, b] = ip as [number, number];
  return (
    a === 127 ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function aiSettings(db: Db): AiSettings {
  const stored = read(db);
  if (!stored || stored.provider === 'off') {
    return {
      provider: 'off',
      baseUrl: stored?.baseUrl ?? null,
      model: stored?.model ?? null,
      hasApiKey: !!stored?.apiKey,
      cloud: false,
      target: null,
    };
  }
  if (stored.provider === 'anthropic') {
    return {
      provider: 'anthropic',
      baseUrl: null,
      model: stored.model,
      hasApiKey: !!stored.apiKey,
      cloud: true,
      target: 'Anthropic',
    };
  }
  let host: string | null;
  try {
    host = new URL(stored.baseUrl ?? '').hostname;
  } catch {
    host = null;
  }
  return {
    provider: 'openai',
    baseUrl: stored.baseUrl,
    model: stored.model,
    hasApiKey: !!stored.apiKey,
    cloud: !host || !isLocalHost(host),
    target: host,
  };
}

export function saveAiSettings(db: Db, key: Buffer, input: AiSettingsInput): AiSettings {
  const current = read(db);
  const apiKey = input.clearApiKey
    ? null
    : input.apiKey
      ? sealSecret(key, input.apiKey)
      : (current?.apiKey ?? null);
  let baseUrl = input.baseUrl?.trim() || null;
  if (input.provider === 'openai') {
    try {
      const url = new URL(baseUrl ?? '');
      if (!/^https?:$/.test(url.protocol)) throw new Error();
      baseUrl = url.toString().replace(/\/+$/, '');
    } catch {
      throw new DomainError(400, 'ai_invalid_url');
    }
    if (!input.model?.trim()) throw new DomainError(400, 'ai_model_required');
  }
  if (input.provider === 'anthropic' && !apiKey) throw new DomainError(400, 'ai_key_required');
  const value: Stored = {
    provider: input.provider,
    baseUrl,
    model:
      input.model?.trim() || (input.provider === 'anthropic' ? DEFAULT_MODELS.anthropic : null),
    apiKey,
  };
  db.insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
  return aiSettings(db);
}

/** The configuration for a call; throws if AI is off. */
export function aiConfig(db: Db, key: Buffer): AiConfig {
  const stored = read(db);
  if (!stored || stored.provider === 'off') throw new DomainError(409, 'ai_not_configured');
  const apiKey = stored.apiKey ? openSecret(key, stored.apiKey) : null;
  if (stored.apiKey && apiKey === null) throw new DomainError(409, 'ai_key_unreadable');
  return {
    provider: stored.provider,
    baseUrl: stored.provider === 'anthropic' ? ANTHROPIC_URL : stored.baseUrl!,
    model: stored.model ?? DEFAULT_MODELS.anthropic,
    apiKey,
  };
}
