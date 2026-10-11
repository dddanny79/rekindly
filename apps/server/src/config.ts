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
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

function parsePublicUrl(value: string | undefined, port: number): URL {
  const raw = value || `http://localhost:${port}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid PUBLIC_URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`PUBLIC_URL must be http(s): ${raw}`);
  }
  return url;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = parsePort(env.PORT, 3000);
  return {
    port,
    host: env.HOST || '0.0.0.0',
    webDistDir: env.WEB_DIST_DIR || fromPackage('../web/dist'),
    dataDir: resolve(
      env.DATA_DIR || (env.NODE_ENV === 'production' ? '/data' : fromPackage('data')),
    ),
    migrationsDir: env.MIGRATIONS_DIR || fromPackage('drizzle'),
    publicUrl: parsePublicUrl(env.PUBLIC_URL, port),
    trustProxy: env.TRUST_PROXY === 'true',
  };
}
