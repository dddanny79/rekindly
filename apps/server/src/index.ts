import { serve } from '@hono/node-server';
import { APP_NAME } from '@app/shared';
import { createApp } from './app';
import { loadConfig } from './config';
import { APP_VERSION } from './version';

const config = loadConfig();
const app = createApp({ webDistDir: config.webDistDir });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`${APP_NAME} ${APP_VERSION} listening on http://${info.address}:${info.port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
