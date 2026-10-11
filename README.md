# Personengedächtnis (working title)

> **Work in progress.** Not usable yet — no releases, no stable data model.

A self-hosted personal relationship memory: keep track of the people you know —
who someone is, key facts, past conversations, open follow-ups — and get a short
briefing before a call or meeting. One person per instance, one container,
SQLite, no telemetry.

## Development

Requirements: Node.js 24 (see `.nvmrc`) and pnpm via Corepack (`corepack enable`).

```sh
pnpm install
pnpm dev          # API on :3000, web dev server on :5173 (proxies /api)
```

The web dev server listens on `0.0.0.0`, so it can be opened from other machines
on the same (e.g. Tailscale) network.

| Script           | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `pnpm dev`       | Server and web app in watch mode                       |
| `pnpm build`     | Production build (`apps/web/dist`, `apps/server/dist`) |
| `pnpm start`     | Run the production server (serves web app + API)       |
| `pnpm test`      | Unit and API tests (Vitest)                            |
| `pnpm test:e2e`  | End-to-end tests (Playwright, needs `pnpm build`)      |
| `pnpm lint`      | ESLint and Prettier check                              |
| `pnpm typecheck` | TypeScript in all packages                             |

For E2E tests, install the browser once: `pnpm exec playwright install --with-deps chromium`.

### Layout

- `apps/server` — Hono API (`/api/v1`, health check at `/api/health`), Drizzle + SQLite, auth; serves the built web app in production
- `apps/web` — React, Vite, Tailwind, shadcn/ui, TanStack Router/Query, i18next (en, de)
- `packages/shared` — Zod schemas, shared types and constants
- `e2e` — Playwright tests

## Configuration

All configuration is via environment variables; see [`.env.example`](.env.example).

| Variable       | Default         | Description                                    |
| -------------- | --------------- | ---------------------------------------------- |
| `PORT`         | `3000`          | Port of the server                             |
| `HOST`         | `0.0.0.0`       | Interface the server binds to                  |
| `WEB_PORT`     | `5173`          | Port of the Vite dev server (development only) |
| `WEB_DIST_DIR` | `apps/web/dist` | Built web app served by the server             |

## License

Not decided yet.
