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

## Format (version 1)

```json
{
  "format": "personengedaechtnis-export",
  "version": 1,
  "exportedAt": "2026-10-12T14:00:00.000Z",
  "app": { "name": "Personengedächtnis", "version": "0.0.0" },
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
- **Not included:** the account (name, email, password), passkeys, sessions, app
  passwords and calendar links (credentials stay with the instance), and data the
  app derives itself (search index, CardDAV cache, recently viewed).
- `version` grows with incompatible changes; an import refuses files from a newer
  version than it knows.

## Restore

1. Start a new, empty instance (new volume) and run the setup.
2. Settings → Data → Restore → choose the export file → Import.
3. Reconnect devices (Settings → Sync): new app passwords and calendar links.

The import checks every photo against its checksum and all references; on any
problem nothing is imported.

## Backups

Until automatic backups exist, either download the full export regularly, or let
the server write database snapshots (see [deployment](deployment.md#backup-and-restore)).
