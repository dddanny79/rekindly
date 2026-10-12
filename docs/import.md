# Importing contacts

**Settings → Import** brings contacts from other address books into a space. For
moving a whole instance, use the full export and restore instead (see
[export](export.md)).

## Formats

- **vCard** (`.vcf`), versions 2.1, 3.0 and 4.0, one or many cards per file.
  - iPhone: Contacts → Lists → touch and hold “All Contacts” → Export.
  - Google: contacts.google.com → Export → vCard.
  - Categories become tags. A card with only a company name (iOS “company”
    contact) becomes an organization. Card lines the app has no field for are
    kept and synced back to CardDAV clients.
- **CSV**, comma, semicolon or tab separated, UTF-8 or Windows-1252.
  - Google: contacts.google.com → Export → Google CSV.
  - Outlook: File → Open & Export → Import/Export → Export to a file → CSV
    (English and German column names).
  - Other files: columns are assigned by their names (`Vorname`, `E-Mail`, `Phone`,
    …). Every column can be reassigned in the preview, or ignored.

## Preview and duplicates

Nothing is saved before **Import**. The preview lists every contact with what will
happen to it:

- **Add** — new contact.
- **Skip** — the default for likely duplicates: the same email address, the same
  phone number (compared by the last nine digits, so `+49 171 …` = `0171 …`) or the
  same first and last name (umlauts folded: Müller = Mueller), among the existing
  people (in all spaces) or earlier in the same file.
- **Complete** — for a duplicate of an existing person: adds what is missing
  (email addresses, phone numbers, addresses, organization, tags, birthday,
  nickname, photo, a note); existing values are never overwritten.

A short one-line note becomes “who is this”; a longer one a note in the timeline.

## Undo

Every import is listed under **Previous imports** and can be undone as a whole:
people and organizations it created go to the trash (restorable for 30 days),
details it added to existing people are removed again. A field it filled in is only
cleared if nobody changed it since.

## API

- `POST /api/v1/contact-imports/preview` — multipart: `file`, `options` (JSON,
  optional `mapping`). Returns the detected format, the CSV columns and mapping, and
  every contact with its likely duplicate and default action.
- `POST /api/v1/contact-imports` — multipart: `file`, `options`
  (`{ spaceId, mapping?, actions: { "<index>": "create" | "skip" | "merge" } }`).
- `GET /api/v1/contact-imports` — previous imports.
- `POST /api/v1/contact-imports/{id}/undo`.
