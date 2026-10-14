# Changelog

All notable changes are documented here. The project follows
[Semantic Versioning](https://semver.org/); while at 0.x, minor versions may contain
breaking changes (always with a migration path for your data).

## [Unreleased]

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

### Changed

- Export format version 3 (adds `questions` and `personDates`); files of version 1 and
  2 still import.
- Dates that earlier versions kept from the iPhone as unknown vCard fields become
  recurring days on start.

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

[Unreleased]: https://github.com/dddanny79/rekindly/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/dddanny79/rekindly/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dddanny79/rekindly/releases/tag/v0.1.0
