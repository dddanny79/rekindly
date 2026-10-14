# Address book sync (CardDAV)

The app is a CardDAV server: the iPhone (or DAVx⁵, Thunderbird, …) shows the
contacts in its address book, and changes flow both ways.

## Set up

1. In the app: **Settings → Sync → Connect a device**. Choose a name and the spaces
   this device should see, then _Create password_. The password is shown once.
2. **iPhone:** Settings → Apps → Contacts → Contacts Accounts → Add Account →
   Other → under _Contacts_: Add CardDAV Account (not _CalDAV_ — that one is for
   calendars and fails with “Cannot connect using SSL”). Server: the host of `PUBLIC_URL` (e.g.
   `contacts.example.com`), user name: the account's email, password: the app
   password.
3. Birthdays: Calendar app → Calendars → turn on _Birthdays_.

Other clients use the address `https://<host>/dav/` (discovery via
`/.well-known/carddav` also works).

iOS syncs only one address book per account, so each app password is one
address book with the chosen spaces. For a work phone, create a password with only
the business space.

## What is synced

- Only **contacts**: no indirect contacts, nothing archived, nothing in the trash.
- Names, nickname, photo, phone numbers, emails, websites (with labels: _Mobile_,
  _Work_, _Home_ map to iOS's types, other labels are kept as custom labels),
  messenger and social profiles, addresses, birthday (with or without year), the
  main organization (with its parents) and role, and _Who is this_ as note.
- **Other recurring days** (with or without year), both ways:
  - _Wedding anniversary_ is the iPhone's built-in date _Anniversary_ (shown as
    _Jahrestag_ on a German iPhone). vCard 4 `ANNIVERSARY` is read as well.
  - All other days are iPhone date fields with a label (`itemN.X-ABDATE` +
    `X-ABLabel`): _Anniversary of death_ / _Todestag_, _Name day_ / _Namenstag_,
    _Anniversary_ / _Jahrestag_, _Day we met_ / _Kennengelernt_ in the account's
    language; an own day keeps its name. A date field added on the phone with one
    of these names (English or German) becomes that kind of day, any other name
    an own day.
  - Dates that an earlier version kept as unknown fields become recurring days
    when the app starts.
- A link back to the person page in the app (`URL` field).
- Fields the app has no place for (e.g. related names) are stored as sent and
  written back unchanged.

## Changes from a device

- Every change made on a device is logged in the person's timeline
  (_Changed via sync_, _Added via sync_).
- Contact details removed on a device go to the **trash** (30 days), not away.
- **Deleting a contact on the phone moves the person to the trash.** Restoring it
  in the app puts it back in the address book.
- An organization removed on the phone is kept in the app (the timeline says so);
  a missing photo does not delete the photo in the app.
- Conflicts: changes are only accepted for the latest version (`If-Match`); a
  device with an outdated copy fetches the current one first.

## Revoke

Settings → Sync → remove the device. It can no longer sync; contacts already on
the device stay there until the account is removed on the device.

## Calendar subscription (follow-ups)

**Settings → Sync → Calendar subscription** creates a secret link (shown once)
with the open follow-ups of the chosen spaces, optionally with birthdays (also of
indirect contacts) and with wedding anniversaries, memorial days and other
recurring days (each a yearly event). Overdue follow-ups appear on today. On the iPhone: Settings →
Apps → Calendar → Calendar Accounts → Add Account → Other → Add Subscribed Calendar.
The calendar is read-only and refreshes about every hour; deleting the
subscription in the app makes the link stop working.

Endpoint: `GET /ics/<secret>.ics` (iCalendar, all-day events).

## Technical notes

- Endpoints: `/.well-known/carddav` → `/dav/`, principal `/dav/principal/`, one
  address book `/dav/addressbooks/contacts/`. Methods: `PROPFIND`, `REPORT`
  (`addressbook-multiget`, `sync-collection`, `addressbook-query` without filters),
  `GET`, `PUT`, `DELETE`. vCard 3.0.
- HTTP Basic authentication with the account email and an app password (stored
  as SHA-256). Failed attempts are rate-limited per client address.
- A reverse proxy must pass the WebDAV methods `PROPFIND` and `REPORT` (Coolify,
  Traefik, Caddy and nginx do by default).
