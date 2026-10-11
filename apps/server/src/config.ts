import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  port: number;
  host: string;
  /** Directory of the built web app; served only if it contains an index.html. */
  webDistDir: string;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: parsePort(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    // The bundle lives in apps/server/dist, the web build in apps/web/dist.
    webDistDir: env.WEB_DIST_DIR || fileURLToPath(new URL('../../web/dist', import.meta.url)),
  };
}
