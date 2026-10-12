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

Continuous integration (GitHub Actions) runs on pull requests: one job for lint,
types, unit and E2E tests; the Docker image is built and smoke-tested when the
Dockerfile, dependencies or server startup change. Merges to `main` run nothing
again. The image is published to ghcr.io for release tags and manual runs.

For E2E tests, install the browser once: `pnpm exec playwright install --with-deps chromium`.

Sample data and search performance (all names and texts are invented):

```sh
# Fill the database in DATA_DIR with invented people; refuses a non-empty one without --force
pnpm --filter @app/server sample-data -- --people 500 --entries 5000
# Measure search times on a temporary database (default: 5,000 people, 50,000 entries)
pnpm --filter @app/server perf
```

### Layout

- `apps/server` — Hono API (`/api/v1`, health check at `/api/health`), Drizzle + SQLite, auth; serves the built web app in production
- `apps/web` — React, Vite, Tailwind, shadcn/ui, TanStack Router/Query, i18next (en, de)
- `packages/shared` — Zod schemas, shared types and constants
- `e2e` — Playwright tests

## Configuration

All configuration is via environment variables; see [`.env.example`](.env.example).
Running it with Docker, Compose, Coolify or behind a reverse proxy, and backups:
[`docs/deployment.md`](docs/deployment.md). Address book sync and calendar subscription:
[`docs/carddav.md`](docs/carddav.md). Export and backups: [`docs/export.md`](docs/export.md); importing contacts: [`docs/import.md`](docs/import.md). API, tokens and MCP (Claude): [`docs/api.md`](docs/api.md). AI features: [`docs/ai.md`](docs/ai.md).

```sh
docker run -p 3000:3000 -v pg-data:/data -e PUBLIC_URL=http://localhost:3000 \
  ghcr.io/dddanny79/personengedaechtnis:edge
```

| Variable       | Default                | Description                                             |
| -------------- | ---------------------- | ------------------------------------------------------- |
| `PUBLIC_URL`   | required in production | Address the app is opened at (passkeys, secure cookies) |
| `DATA_DIR`     | `/data` in production  | Database and files                                      |
| `PORT`         | `3000`                 | Port of the server                                      |
| `HOST`         | all (IPv6 + IPv4)      | Interface the server binds to                           |
| `TZ`           | `UTC`                  | Time zone                                               |
| `APP_SECRET`   | `DATA_DIR/secret.key`  | Key for stored backup credentials                       |
| `TRUST_PROXY`  | `false`                | `true` behind a reverse proxy                           |
| `LOG_LEVEL`    | `info`                 | `error`, `warn`, `info`, `debug`                        |
| `WEB_PORT`     | `5173`                 | Port of the Vite dev server (development only)          |
| `WEB_DIST_DIR` | `apps/web/dist`        | Built web app served by the server                      |

## Maintenance

Command-line tools of the server (in the container: `node dist/cli.js <command>`;
in development: `pnpm --filter @app/server cli <command>`):

| Command          | Purpose                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `reset-password` | Set a new account password and sign out all sessions              |
| `reindex`        | Rebuild the full-text search index (normally kept current itself) |
| `backup [file]`  | Consistent copy of the database while the app runs                |

Deleted data goes to the trash and stays restorable for 30 days; the server purges
older items at start and then once a day.

## License

Not decided yet.
