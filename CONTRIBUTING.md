# Contributing

Thanks for your interest in Rekindly! Bug reports, ideas, translations and pull
requests are welcome.

## Before you start

- **Bugs and ideas:** open an issue first, so we can agree on the approach before you
  spend time on code.
- **Security issues:** see [SECURITY.md](SECURITY.md), not public issues.
- **Never include real personal data** in issues, tests, screenshots or fixtures —
  test data is always invented (`example.com`, `+49 170 555…`).

## Development setup

Requirements: Node.js 24 (see `.nvmrc`) and pnpm via Corepack (`corepack enable`).

```sh
pnpm install
pnpm dev          # API on :3000, web app on :5173 (proxies /api)
```

Invented sample data: `pnpm --filter @app/server sample-data -- --people 200 --entries 2000`.

| Script           | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `pnpm dev`       | Server and web app in watch mode                       |
| `pnpm build`     | Production build (`apps/web/dist`, `apps/server/dist`) |
| `pnpm test`      | Unit and API tests (Vitest)                            |
| `pnpm test:e2e`  | End-to-end tests (Playwright, needs `pnpm build`)      |
| `pnpm lint`      | ESLint and Prettier check                              |
| `pnpm typecheck` | TypeScript in all packages                             |

For E2E tests, install the browser once: `pnpm exec playwright install --with-deps chromium`.

## Layout

- `apps/server` — Hono API (`/api/v1`), Drizzle + SQLite (FTS5), auth, CardDAV, MCP;
  serves the built web app in production
- `apps/web` — React, Vite, Tailwind, shadcn/ui, TanStack Router/Query, i18next
- `packages/shared` — Zod schemas (the API contract; OpenAPI is generated from them),
  shared types and constants
- `e2e` — Playwright tests
- `docs` — user and operator documentation

## Conventions

- **English** in code, comments, commits and docs.
- **Conventional Commits** (`feat:`, `fix:`, `docs:` …); one topic per pull request.
- **API first:** the web app only uses the public API under `/api/v1`. Request and
  response shapes are Zod schemas in `packages/shared`; every route is listed in
  `apps/server/src/openapi/spec.ts` (a test fails otherwise).
- Business logic in services, not in route handlers; small modules per domain.
- **Every schema change needs a Drizzle migration** (`pnpm --filter @app/server db:generate`);
  never edit a migration that is already on `main`.
- **Never hard-delete user data** in normal flows: use `deleted_at` (trash, 30 days).
- **Translations:** every user-facing string goes through i18next, with keys in `en`
  **and** `de` (`apps/web/src/i18n/locales`). New languages are welcome.
- One container, SQLite, no extra services; no telemetry and no external calls except
  services the user configures; no CDN assets.
- UI: shadcn/ui components and the rules in [`docs/design.md`](docs/design.md);
  mobile first, keyboard friendly, light and dark.

## Pull requests

- Tests for every API route and an E2E test for the main user flow you touch.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and the E2E tests pass.
- Describe what you changed and how you tested it; screenshots for UI changes (with
  invented data).

By contributing you agree that your contribution is licensed under the
[GNU Affero General Public License v3.0 or later](LICENSE).
