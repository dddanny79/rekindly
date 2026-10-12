import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This module sits at the same depth below apps/server in src/ and in the dist bundle,
// so the relative URLs below resolve to the same places in development and production.
const fromPackage = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

export interface ServerConfig {
  port: number;
  host: string;
  /** Directory of the built web app; served only if it contains an index.html. */
  webDistDir: string;
  /** Database and files live here. */
  dataDir: string;
  /** Drizzle migrations shipped with the server. */
  migrationsDir: string;
  /** Public origin of the app; used for WebAuthn and secure cookies. */
  publicUrl: URL;
  /** Trust X-Forwarded-For (only when running behind a reverse proxy). */
  trustProxy: boolean;
  logLevel: LogLevel;
}

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Invalid or missing settings; the message lists every problem. */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a number between 1 and 65535, got "${value}".`);
  }
  return port;
}

function parsePublicUrl(value: string | undefined, port: number, production: boolean): URL {
  if (!value && production) {
    throw new Error(
      'PUBLIC_URL is required: the address the app is opened at, e.g. https://people.example.com (used for passkeys and secure cookies).',
    );
  }
  const raw = value || `http://localhost:${port}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`PUBLIC_URL is not a valid URL: "${raw}".`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`PUBLIC_URL must start with http:// or https://, got "${raw}".`);
  }
  return url;
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (!value) return 'info';
  const level = value.toLowerCase();
  if (!(LOG_LEVELS as readonly string[]).includes(level)) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${value}".`);
  }
  return level as LogLevel;
}

function checkTimeZone(value: string | undefined) {
  if (!value) return;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.replace(/^:/, '') });
  } catch {
    throw new Error(`TZ is not a known time zone, got "${value}" (e.g. Europe/Berlin).`);
  }
}

function parseBoolean(name: string, value: string | undefined): boolean {
  if (!value) return false;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`${name} must be true or false, got "${value}".`);
}

/**
 * Reads the configuration from the environment. In production (`NODE_ENV=production`,
 * as in the Docker image) `PUBLIC_URL` is required. Throws a `ConfigError` listing
 * all problems at once.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const problems: string[] = [];
  const read = <T>(parse: () => T, fallback: T): T => {
    try {
      return parse();
    } catch (error) {
      problems.push((error as Error).message);
      return fallback;
    }
  };
  const port = read(() => parsePort(env.PORT, 3000), 3000);
  const config: ServerConfig = {
    port,
    host: env.HOST || '0.0.0.0',
    webDistDir: env.WEB_DIST_DIR || fromPackage('../web/dist'),
    dataDir: resolve(env.DATA_DIR || (production ? '/data' : fromPackage('data'))),
    migrationsDir: env.MIGRATIONS_DIR || fromPackage('drizzle'),
    publicUrl: read(
      () => parsePublicUrl(env.PUBLIC_URL, port, production),
      new URL('http://localhost'),
    ),
    trustProxy: read(() => parseBoolean('TRUST_PROXY', env.TRUST_PROXY), false),
    logLevel: read(() => parseLogLevel(env.LOG_LEVEL), 'info'),
  };
  read(() => checkTimeZone(env.TZ), undefined);
  if (problems.length) throw new ConfigError(problems);
  return config;
}
