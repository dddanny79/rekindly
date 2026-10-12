# Changelog

All notable changes are documented here. The project follows
[Semantic Versioning](https://semver.org/); while at 0.x, minor versions may contain
breaking changes (always with a migration path for your data).

## [Unreleased]

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

[Unreleased]: https://github.com/dddanny79/rekindly/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dddanny79/rekindly/releases/tag/v0.1.0
