# Export, import and backup

## In the app

**Settings → Data**

- **Download full export (JSON):** everything in one file — the basis for backups.
- **Contacts as vCard:** all contacts or one space, for other address books
  (indirect contacts are left out).
- **Restore:** imports a full export into an instance that has no people,
  organizations or entries yet (e.g. right after the setup).

API: `GET /api/v1/export/json`, `GET /api/v1/export/vcf?spaceId=…`,
`GET /api/v1/import/status`, `POST /api/v1/import` (body: the export file).

## Format (version 3)

```json
{
  "format": "rekindly-export",
  "version": 3,
  "exportedAt": "2026-10-12T14:00:00.000Z",
  "app": { "name": "Rekindly", "version": "0.0.0" },
  "data": {
    "spaces": [],
    "relationshipTypes": [],
    "tags": [],
    "fieldDefinitions": [],
    "organizations": [],
    "people": [],
    "contactPoints": [],
    "addresses": [],
    "affiliations": [],
    "facts": [],
    "entries": [],
    "entryPeople": [],
    "reminders": [],
    "relationships": [],
    "personTags": [],
    "fieldValues": [],
    "settings": [],
    "davExtras": [],
    "themes": [],
    "questions": [],
    "files": [
      {
        "id": "…",
        "path": "….jpg",
        "mime": "image/jpeg",
        "size": 0,
        "sha256": "…",
        "createdAt": "…",
        "data": "<base64>"
      }
    ]
  }
}
```

- Every list holds the rows of one table as the database stores them, with the
  original ids and timestamps, field names in camelCase (see
  `apps/server/src/db/schema`). Dates are ISO strings in UTC, birthdays `YYYY-MM-DD`
  or `--MM-DD`.
- **The trash is included** (rows with `deletedAt`), so a restore brings it back.
- `entryPeople` keeps the order in which people were linked to an entry.
- `davExtras`: vCard fields from address book clients that the app has no field for.
- `themes`: themes made or imported on this instance (the built-in ones are part of the app).
- `questions`: questions for next time, open ones and asked ones (`askedAt`).
- **Not included:** the account (name, email, password), passkeys, sessions, app
  passwords, API tokens and calendar links (credentials stay with the instance), the
  settings that belong to the instance (backup target, the sign-in-code switch, mail
  delivery state), and data the app derives itself (search index, CardDAV cache,
  recently viewed). The stored SMTP password and AI key are included only sealed with
  the instance's key; on another server, enter them again.
- Version 3 added `questions`, version 2 `themes`; older files import as before.
- `version` grows with incompatible changes; an import refuses files from a newer
  version than it knows.

## Restore

1. Start a new, empty instance (new volume) and run the setup.
2. Settings → Data → Restore → choose the export file → Import.
3. Reconnect devices (Settings → Sync, API & MCP): new app passwords, calendar links and API tokens.

The import checks every photo against its checksum and all references; on any
problem nothing is imported.

## Automatic backups

**Settings → Data → Automatic backup**

Every night (time configurable) the app makes a full export, compresses and
encrypts it and uploads it to

- a **WebDAV** folder (Nextcloud, ownCloud, Synology, Hetzner Storage Box …), or
- **S3-compatible** storage (Hetzner Object Storage, Backblaze B2, AWS S3, MinIO …;
  path-style requests, Signature Version 4).

The newest backups are kept (default 14), older ones are deleted. **Back up now**
runs one immediately, **Test connection** writes and deletes a small test file. A
failed backup, or none for more than three days, shows a warning on the Today page.
If a run fails, the app tries again every hour until it succeeds that day.

Files are named `rekindly-2026-10-12T03-00-05Z.backup` (backups from before the rename, `rekindly-…`, are still listed, restored and rotated).

### Encryption

Backups are encrypted on the server with the **backup password** before they are
uploaded: AES-256-GCM, key from the password via scrypt (N = 2¹⁵, r = 8, p = 1).
File layout: `PGBACKUP1\n`, salt (16 bytes), IV (12), auth tag (16), then the
encrypted gzip of the export JSON. **Without the backup password a backup cannot be
restored** — store it separately, e.g. in a password manager.

The target credentials and the backup password are stored encrypted in the database
with the instance key (`APP_SECRET`, or else `DATA_DIR/secret.key`). They are never
part of an export or a backup. After moving to a new server without the same key,
enter them again.

### Restore from a backup

1. Start a new, empty instance and run the setup.
2. Settings → Data → Automatic backup: set up the same target (and a backup password).
3. **Show backups at the target** → **Restore** → enter the backup password of that
   backup.

Or download a `.backup` file from the target and choose it under **Restore**; the
app then asks for its backup password.

API: `GET`/`PUT /api/v1/backup`, `POST /api/v1/backup/test`, `POST /api/v1/backup/run`,
`GET /api/v1/backup/files`, `POST /api/v1/backup/restore`; `POST /api/v1/import`
also accepts a backup file (`Content-Type: application/octet-stream`, password in the
header `X-Backup-Passphrase`, URL-encoded).

## Database snapshots

Additionally the server can write SQLite snapshots into the volume (see
[deployment](deployment.md#backup-and-restore)).
