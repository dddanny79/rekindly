import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 3100);
const origin = `http://localhost:${port}`;
export const STORAGE_STATE = 'e2e/.auth/state.json';

/**
 * E2E tests run against the production build with a fresh data directory: the
 * server serves the built web app and the API on one port. Run `pnpm build` first
 * (CI does). The setup project walks through the first-start wizard once and
 * stores the session for the other tests.
 */
export default defineConfig({
  testDir: './e2e',
  // One server, one database: run in order.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    // localhost (not 127.0.0.1): WebAuthn needs a domain as relying party id.
    baseURL: origin,
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /setup\.spec\.ts/ },
    {
      name: 'chromium',
      testIgnore: /setup\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], locale: 'en-US', storageState: STORAGE_STATE },
    },
  ],
  webServer: {
    command: 'rm -rf .e2e-data && node apps/server/dist/index.js',
    url: `${origin}/api/health`,
    env: { PORT: String(port), HOST: '127.0.0.1', DATA_DIR: '.e2e-data', PUBLIC_URL: origin },
    reuseExistingServer: false,
  },
});
