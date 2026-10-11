import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 3100);

/**
 * E2E tests run against the production build: the server serves the built
 * web app and the API on one port. Run `pnpm build` first (CI does).
 */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], locale: 'en-US' } }],
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: `http://127.0.0.1:${port}/api/health`,
    env: { PORT: String(port), HOST: '127.0.0.1' },
    reuseExistingServer: !process.env.CI,
  },
});
