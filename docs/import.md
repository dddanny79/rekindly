# Importing contacts

**Settings → Import** brings contacts from other address books, and from Monica, into a space. For
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

- **Monica** (4.x): the JSON account export (Monica: Settings → Export → “Export to
  Json”, file `monica.json`), or fetched through Monica's API (see below).

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

## Monica

What comes along, and where it goes:

| Monica                                                                                           | Here                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Contact: names, nickname, description, starred, birthday, job and company, tags, “stay in touch” | Person: names, nickname, “who is this”, favorite, birthday, organization and role, tags, contact rhythm |
| Partial contacts (only known through a relationship)                                             | Indirect contacts                                                                                       |
| Archived contacts                                                                                | Archived people                                                                                         |
| Contact fields: email, phone; WhatsApp, Telegram, … ; Facebook, LinkedIn, …                      | Email, phone; messenger; social profile                                                                 |
| Addresses (country code)                                                                         | Addresses (country name)                                                                                |
| “How you met”: date, through whom, text                                                          | Met when, met through, met where                                                                        |
| Notes                                                                                            | Timeline notes; **favorite notes become facts**                                                         |
| Calls                                                                                            | Timeline calls (incoming when the contact called)                                                       |
| Activities (with all participants)                                                               | Timeline meetings, linked to every participant                                                          |
| Conversations, life events                                                                       | Timeline messages, events                                                                               |
| Reminders (active; not Monica's automatic birthday reminders)                                    | Follow-ups: the next date; yearly ones repeat yearly                                                    |
| Open tasks                                                                                       | Follow-ups due on the import day                                                                        |
| Relationships                                                                                    | Relationships; types without a counterpart here (grandparent, godparent, mentor, …) are created         |
| Avatar photo (export only)                                                                       | Profile photo                                                                                           |
| Deceased, food preferences, age-based birth year                                                 | Facts                                                                                                   |

Not imported: gifts, debts, pets, journal, documents, Monica's own user contact.

If a Monica contact matches a person who is already here (e.g. synced from the
iPhone), the default is **Complete**, so its timeline is added to that person.
Importing the same file again does not duplicate timeline entries.

### Fetching through the API

Monica: Settings → API → create a personal access token. In the import page,
“Fetch from Monica instead …” takes the Monica address and the token; the server
reads the account (100 items per request, waits when Monica limits the rate) and the
result goes through the same preview. The token is not stored. Monica's API leaves
out archived contacts and photos — use the JSON export for those.

### Format notes (JSON export, version `1.0-preview.1`)

From Monica's source (`app/ExportResources`, branch `4.x`); no real export was
available, the tests use an invented one (`apps/server/src/contact-imports/monica-fixture.ts`).

- Top level: `version`, `app_version`, `export_date`, `url`, `account`.
- Every object: `uuid`, `created_at`, `updated_at`, `properties`, and for nested
  lists `data: [{ count, type, values }]`. Empty lists and empty properties are left
  out. References are uuids; relationship types are names, tags plain strings.
- `account.data`: `user` (with `me_contact`), `contact` (all, incl. partial and
  archived), `relationship`, `addressbook` (subscriptions), `photo`
  (`dataUrl` with the image), `activity`.
- Contact `data`: `call`, `contact_field`, `note`, `reminder`, `task`, `address`,
  `conversation`, `life_event`, and uuid lists `activity`, `photo`, `document`
  (activity participants are these lists).
- Special dates (`birthdate`, `deceased_date`, `first_met_date`):
  `{ is_age_based, is_year_unknown, date }`; with an unknown year the year in
  `date` is meaningless, age-based dates only carry the year.
- Relationship `{ type, contact_is: A, of_contact: B }` means “B is A's <type>”;
  Monica stores every relationship twice (once per direction).
- `account.instance.contact_field_types` resolves contact field types (`type`
  `email`, `phone`, or none for social/messenger types).

## Duplicates

**People → “possible duplicates”** (also linked after an import) lists pairs of
people with the same email address, phone number (last nine digits) or first and
last name (umlauts folded) — including indirect contacts and people in other
spaces. A value shared by more than ten people (e.g. an office switchboard) is not
used.

- **Different people** hides the pair for good.
- **Merge …** asks who stays (by default the one with more details) and, where both
  have a different value (name, nickname, birthday, “who is this”, met …, photo,
  contact rhythm, space), which one to keep. Empty values are always filled.
  Contact details, addresses, organizations, facts, follow-ups, the timeline,
  relationships, tags and custom fields of both are combined; exact duplicates are
  dropped. The other person goes to the trash; a hidden sync note on the kept
  person records the merge.
- The same is available on every person page: **… → Merge with another person …**.

## API

- `POST /api/v1/contact-imports/preview` — multipart: `file`, `options` (JSON,
  optional `mapping`). Returns the detected format, the CSV columns and mapping, and
  every contact with its likely duplicate and default action.
- `POST /api/v1/contact-imports` — multipart: `file`, `options`
  (`{ spaceId, mapping?, actions: { "<index>": "create" | "skip" | "merge" } }`).
- `GET /api/v1/contact-imports` — previous imports.
- `POST /api/v1/contact-imports/{id}/undo`.
- `GET /api/v1/duplicates` — likely duplicate pairs with reasons.
- `POST /api/v1/duplicates/dismiss` — `{ personIds: [a, b] }`.
- `POST /api/v1/duplicates/merge` — `{ keepId, mergeId, take: ["name", "birthday", …] }`;
  returns the kept person.
- `POST /api/v1/contact-imports/monica-fetch` — `{ url, token }`; returns a file
  (JSON) to use as `file` in preview and import.
