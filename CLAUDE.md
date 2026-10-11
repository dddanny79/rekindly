# CLAUDE.md

Guidance for Claude Code sessions working on this repository.

## What this is

A self-hosted, open-source **personal relationship memory**: one person per
instance keeps track of the people they know — who someone is, key facts, past
conversations, open follow-ups — and gets a briefing before a call or meeting.
Working title “Personengedächtnis”; the public product name is not decided yet,
so do not hard-code a name anywhere except the single `APP_NAME` constant.

The product spec is `PROJEKTPLAN.md` (German). Work is delivered as numbered
tasks in `auftraege/` (German). Read both before starting a task; the task file
defines scope and acceptance criteria. Do not build features from later tasks.

## Hard rules

- **This repository will be made public, including its full history.** Never
  commit real personal data (not even briefly for testing), `.env` files, tokens,
  keys or database files. Test and seed data are always invented. If something
  sensitive was committed, stop and tell the user — do not just delete it in a
  follow-up commit.

- **One user per instance.** No multi-tenancy, no teams, no roles. Data is
  separated into *spaces* (e.g. Private / Business), not users.
- **One container, no extra services.** SQLite in `/data`, files in `/data/files`.
  Never add Redis, Meilisearch, a separate DB container or a cloud service as a
  requirement.
- **No telemetry, no external calls** except ones the user configured (AI provider,
  outgoing mail). No CDN assets at runtime — everything is bundled.
- **Never hard-delete user data from normal UI/API/sync flows.** Use `deleted_at`
  (trash, 30 days). CardDAV deletes go to the trash too.
- **Migrations for every schema change** (Drizzle). Never edit a migration that
  has been committed to `main`.
- **English first** in code, comments, commits, API, docs. Every user-facing
  string goes through i18next with keys in `en` **and** `de` (German with real
  umlauts and ß, never ae/oe/ue/ss substitutes).
- **API first.** The web app uses only the public, documented API (`/api/v1`).
  Request/response shapes are Zod schemas in `packages/shared`; OpenAPI is
  generated from them.
- Secrets only via environment variables; document every variable in
  `.env.example` and the README.

## Stack

- TypeScript strict, Node.js 24 LTS, pnpm workspaces
- `apps/server`: Hono, Drizzle ORM + SQLite (WAL, FTS5), argon2, SimpleWebAuthn
- `apps/web`: React, Vite, shadcn/ui, Tailwind, TanStack Router + Query, i18next
- `packages/shared`: Zod schemas, shared types, constants
- Tests: Vitest (unit + API against a temp SQLite file), Playwright (E2E)
- Docker: multi-stage build, non-root user, single port `3000`, volume `/data`,
  healthcheck `GET /api/health`, images for amd64 and arm64

## Conventions

- Small, focused modules; domain folders on the server (`people`, `organizations`,
  `entries`, `search`, `auth`, `dav`, …), each with routes, service, schema, tests.
- Business logic in services, not in route handlers.
- Every API route has a test; every task adds or updates E2E coverage for its
  main user flow.
- UI: shadcn/ui components, light/dark via system preference, mobile-first.
  Keyboard first: `⌘K`/`Ctrl+K` command palette, sensible shortcuts.
- Dates stored as ISO strings in UTC; birthdays as `--MM-DD` or `YYYY-MM-DD`
  (year optional).
- Search must normalize umlauts/accents (Müller = Mueller = Muller).
- Conventional Commits. One task = one branch (`task/NN-short-name`) = one PR.

## Before you say a task is done

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; E2E for the touched flow passes.
2. The app was actually started and the flow was clicked through (or driven via
   Playwright) — not only unit-tested.
3. Acceptance criteria in the task file are checked off one by one in the PR
   description; anything not done is listed explicitly, not hidden.
4. `en` and `de` translations are complete for new strings.
