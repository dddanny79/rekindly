# Changelog

All notable changes are documented here. The project follows
[Semantic Versioning](https://semver.org/); while at 0.x, minor versions may contain
breaking changes (always with a migration path for your data).

## [Unreleased]

## [0.3.2] — 2026-10-26

### Changed

- **No more zoom on the iPhone:** on touch screens, form fields use at least 16px text,
  so Safari no longer zooms in when you tap a field and no longer stays zoomed in after
  a dialog closes. Zooming with two fingers works as before.
- **Websites are links:** an organization's website and custom fields of type URL open
  in a new tab when tapped. Editing them now has its own pencil button, like contact
  details.

### Added

- **Map and directions for addresses:** every address of a person or organization has
  “Map” and “Directions” links. They open Apple Maps on iPhone, iPad and Mac and
  OpenStreetMap on other computers. On Android, “Map” opens your maps app and
  “Directions” opens Google Maps. These are only links: Rekindly looks nothing up, and
  an address goes to a maps service only when you tap one of them.

### Upgrading from 0.3.1

Nothing to do: 0.3.2 has no database migrations.

## [0.3.1] — 2026-10-16

### Changed

- **Safe updates:** before an update changes the database, the app saves a copy of it
  to `/data/backups/pre-update-….sqlite` (the newest 3 are kept). Without a copy, it
  does not update. The update itself runs with foreign keys switched off, so rebuilding
  a table can never take dependent rows (entries, facts, links, …) with it; afterwards
  every reference is checked, and the app stops with a clear message instead of running
  on a damaged database. See [deployment](docs/deployment.md#updating).

### Upgrading from 0.3.0

Nothing to do: 0.3.1 has no database migrations. From the next update that changes
the database on, the copy is saved first.

## [0.3.0] — 2026-10-14

### Added

- **Ask next time:** collect questions for the next conversation with someone (“How
  was the marathon?”). They sit at the top of the briefing, can be added there or with
  `/ask …` (also `/frag …`) in the timeline input, reordered, edited and deleted (to
  the trash). Tick one once you have asked; with an answer, a note with question and
  answer is added to the timeline. Open questions are searchable and part of the MCP
  briefing, exports and backups.
- **Recurring days:** besides the birthday, a person can have wedding
  anniversaries, anniversaries, memorial days, name days, the day you met or own
  days (with or without year), under _Details_. Days in the next 14 days show in the
  briefing and on Today together with birthdays, in the daily mail and, if chosen, in
  the calendar subscription. Tactful texts: memorial days count the years since,
  never what someone “turns”. Two-way CardDAV sync with the iPhone (anniversary and
  labelled date fields), vCard and Monica import, trash, export, MCP.
- **Remind per day:** each recurring day has a _Remind_ switch (bell in the details).
  Switched off, the day stays in the details and the briefing but leaves Today, the
  daily mail and calendar subscriptions — e.g. for a memorial day you want to know,
  not be reminded of.
- **Calendar subscriptions can be changed** (name, spaces, birthdays, other days)
  without a new link.

### Changed

- Calendar subscriptions: birthdays are _None_, _Only indirect contacts_ or _All_.
  With CardDAV the iPhone already shows its contacts' birthdays; _Only indirect
  contacts_ adds the rest without showing any birthday twice. Existing subscriptions
  keep what they had (all or none). API: `birthdays` replaces `includeBirthdays`, which
  is still accepted and returned.
- Export format version 3 (adds `questions` and `personDates`); files of version 1 and
  2 still import.
- Dates that earlier versions kept from the iPhone as unknown vCard fields become
  recurring days on start.

### Upgrading from 0.2

Three database migrations run automatically on start. Make a backup first
(`docker exec <container> node dist/cli.js backup`). 0.2 cannot import exports or
backups made by 0.3 (format version 3); 0.3 imports all older files.

## [0.2.0] — 2026-10-13

### Added

- **Mail:** SMTP settings in the app (or `SMTP_*` environment variables), a daily
  summary of due follow-ups, birthdays and overdue contacts, and sign-in codes by
  email (two-factor) with trusted browsers and the `disable-2fa` command. Failed
  mails explain the likely cause; `docs/mail.md` has a troubleshooting section.
- **Themes and layouts:** six built-in themes for light and dark mode (Rekindly,
  Ledger, Hearth, Clear, Studio, Forest), five layouts for the person page
  (Classic, Conversation, Profile, Address book, Focus), own themes built in the app
  with a live preview and shared as a file (`docs/themes.md`). Chosen per device,
  with a default for the instance.
- **Logo**, favicons and home screen icons.

### Changed

- Calendar subscriptions: birthdays are _None_, _Only indirect contacts_ or _All_.
  With CardDAV the iPhone already shows its contacts' birthdays; _Only indirect
  contacts_ adds the rest without showing any birthday twice. Existing subscriptions
  keep what they had (all or none). API: `birthdays` replaces `includeBirthdays`, which
  is still accepted and returned.

- Export format version 2: full exports and backups now include own themes. Files
  of version 1 still import; 0.1 cannot import files of version 2.
- Settings that belong to the instance (backup target, the sign-in-code switch, mail
  delivery state) are no longer part of exports, so a restore on another server
  cannot lock you out.

### Fixed

- Backups with a photo whose file was missing on disk could not be restored.
- Phones: the label picker for phone numbers and emails works on the iPhone; the
  filter buttons of the people list and the export button no longer run off screen.

### Upgrading from 0.1

Two database migrations run automatically on start. Make a backup first
(`docker exec <container> node dist/cli.js backup`). Mail is optional; see
`docs/mail.md` for the settings and the `SMTP_*` variables.

## [0.1.0] — 2026-10-13

First public release:

- People and organizations, briefing, timeline, facts, follow-ups, relationships,
  indirect contacts, tags, custom fields, spaces
- Today page, full-text search with umlaut folding, command palette, trash (30 days)
- Account with password and passkeys; English and German; light and dark mode
- CardDAV sync (iPhone and others), calendar subscription (ICS)
- Import from vCard, CSV (Google, Outlook) and Monica (export or API) with preview,
  duplicate detection and undo; finding and merging duplicates
- Full export and restore, vCard export, encrypted automatic backups (WebDAV, S3)
- Optional AI (OpenAI-compatible incl. LM Studio/Ollama, or Anthropic): briefing
  summary, fact suggestions, questions with sources — per space opt-in
- API tokens, OpenAPI reference at `/api/docs`, MCP server for Claude
- One Docker image (amd64, arm64), SQLite, no telemetry

[Unreleased]: https://github.com/dddanny79/rekindly/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/dddanny79/rekindly/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/dddanny79/rekindly/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/dddanny79/rekindly/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/dddanny79/rekindly/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dddanny79/rekindly/releases/tag/v0.1.0
