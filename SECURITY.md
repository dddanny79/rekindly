# Security policy

Rekindly stores personal data about the people in your life, so security reports are
very welcome.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
**Security → Report a vulnerability** in this repository. You will get an answer
within a few days. Once a fix is released, the report is published with credit to
you (unless you prefer otherwise).

Helpful in a report: the version or commit, how to reproduce it, and what an attacker
could do with it.

## Supported versions

Only the latest release receives security fixes while the project is at 0.x.

## Scope notes

- One account per instance; authentication by password and optional passkeys,
  CardDAV with separate device passwords, API/MCP with API tokens.
- Credentials for backup targets and AI providers are stored encrypted with the
  instance key (`APP_SECRET` or `DATA_DIR/secret.key`).
- The app makes no outgoing requests except to services the user configures
  (backup target, AI provider, Monica import).
