# Themes and layouts

Rekindly's look is a **theme**: colours for light and dark mode, two fonts, corner
radius, density and text size. The **layout** decides which sections the person page
shows, in which order and in how many columns. Both are chosen per device under
**Settings → Appearance**; devices without a choice of their own follow the default
of the instance.

You can build your own theme in the app, export it as a file, share it and import it
on another instance. No programming is needed; this page explains the file for those
who want to edit it by hand.

## Built-in themes

| Theme                    | Character                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------- |
| **Rekindly** (default)   | Set like a newspaper column: Newsreader and Source Sans 3, one red pencil.          |
| **Ledger** (_Kontobuch_) | Dense and cool for many contacts at work: IBM Plex Sans throughout, square corners. |
| **Hearth** (_Kamin_)     | Warm paper and terracotta, Fraunces, generous spacing and soft corners.             |
| **Clear** (_Klar_)       | Highest contrast, Atkinson Hyperlegible Next and larger text, for legibility.       |
| **Studio**               | Modern and calm: Inter throughout, indigo accents, rounded corners.                 |
| **Forest** (_Wald_)      | Quiet greens and Literata, a bookish serif for long reading on the timeline.        |

Every built-in theme has a light and a dark palette in which all text colours reach
a contrast of at least 4.5:1 to the background (tested automatically).

## Layout templates

| Layout                        | What it shows                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------ |
| **Classic**                   | Briefing and timeline in the main column, everything else in a side column.    |
| **Conversation** (_Gespräch_) | One column: briefing, facts, timeline, then the rest.                          |
| **Profile** (_Steckbrief_)    | Details and connections in the main column, contact and timeline beside them.  |
| **Address book**              | Contact details, addresses and organizations first; briefing and facts beside. |
| **Focus** (_Fokus_)           | Only briefing, timeline and contact details; the other sections are hidden.    |
| **From the theme**            | The layout the selected theme brings along (Classic if it has none).           |

On phones every layout is shown as one column, in the order of the layout.

## Making your own

1. **Settings → Appearance → New theme** (or **Duplicate** on any theme). This makes
   an editable copy and opens the editor.
2. Change name, colours, fonts, spacing and, if you like, the layout. Every change
   shows across the app immediately; switch between **Light** and **Dark** to edit
   both palettes. Text colours show their contrast to the background.
3. **Save**. **Export** downloads the theme as `name.rekindly-theme.json`.

To use a theme file, choose **Import theme** on the same page. The theme is checked,
saved and selected on this device. Deleting an own theme moves it to the trash for
30 days and can be undone.

**Use the choice of this device** under _Default for all devices_ makes the current
theme and layout the default of the instance.

## The file format

A theme is a JSON file. Only `format`, `version` and `name` are required; everything
you leave out keeps the value of the default Rekindly theme.

```json
{
  "format": "rekindly-theme",
  "version": 1,
  "name": "Harbour",
  "description": "Blue-grey and calm.",
  "author": "Your name",
  "colors": {
    "light": { "background": "#f4f6f8", "signal": "#a33b1d", "space-navy": "#1f4f8a" },
    "dark": { "background": "#0e1318", "signal": "#ee9070" }
  },
  "fonts": { "content": "source-serif-4", "ui": "inter" },
  "radius": "medium",
  "density": "normal",
  "textSize": "normal",
  "personPage": {
    "columns": 2,
    "sideWidth": "narrow",
    "sections": [
      { "id": "briefing", "column": "main" },
      { "id": "contact", "column": "side" },
      { "id": "timeline", "column": "main" },
      { "id": "facts", "column": "side" },
      { "id": "tags", "column": "side", "hidden": true }
    ]
  },
  "css": ".kicker { letter-spacing: 0.16em; }"
}
```

### Fields

| Field         | Values                                                            |
| ------------- | ----------------------------------------------------------------- |
| `format`      | Always `"rekindly-theme"`.                                        |
| `version`     | Always `1` for this format.                                       |
| `name`        | 1–60 characters.                                                  |
| `description` | Optional, up to 300 characters.                                   |
| `author`      | Optional, up to 80 characters.                                    |
| `colors`      | `light` and `dark`, each with any of the colour tokens below.     |
| `fonts`       | `content` (names, headings, notes) and `ui` (controls, labels).   |
| `radius`      | `none`, `small` (default), `medium`, `large`.                     |
| `density`     | `compact`, `normal` (default), `comfortable`: spacing everywhere. |
| `textSize`    | `small`, `normal` (default), `large`: scales all text.            |
| `personPage`  | Optional layout, used where _From the theme_ is selected.         |
| `css`         | Optional custom CSS, up to 20,000 characters (see below).         |

Unknown fields are rejected, so a typo does not go unnoticed.

### Colour tokens

Colours are hex values: `#rgb`, `#rrggbb` or `#rrggbbaa` (with transparency).

| Token                         | Used for                                                                |
| ----------------------------- | ----------------------------------------------------------------------- |
| `background`                  | Page background                                                         |
| `foreground`                  | Text, primary buttons, rules                                            |
| `foreground-2`                | Secondary text, sub-lines                                               |
| `muted`                       | Hover and active rows, quiet surfaces                                   |
| `muted-foreground`            | Dates, meta lines, labels                                               |
| `popover`                     | Input fields, dialogs, the command palette                              |
| `border`                      | Hairlines between rows                                                  |
| `border-strong`               | Section rules, the double rule, segmented controls                      |
| `input`                       | Borders of inputs and secondary buttons                                 |
| `ring`                        | Focus ring                                                              |
| `signal`                      | The “red pencil”: due items, the active position, counters              |
| `signal-tint`                 | Highlight of search hits                                                |
| `destructive`                 | Delete buttons and error messages                                       |
| `space-olive` … `space-slate` | The six colours spaces can pick (olive, navy, plum, teal, ochre, slate) |
| `overlay`                     | Dimming behind dialogs (use transparency, e.g. `#14141466`)             |

Text tokens (`foreground`, `foreground-2`, `muted-foreground`, `signal`,
`destructive` and the space colours) should reach a contrast of 4.5:1 against
`background`; `input`, `border-strong` and `ring` at least 3:1. The editor shows the
ratio next to each text colour.

### Fonts

All fonts are bundled with Rekindly (no font service is contacted) and only
downloaded by the browser when a theme uses them.

| Key                          | Font                       | Style      |
| ---------------------------- | -------------------------- | ---------- |
| `newsreader`                 | Newsreader                 | Serif      |
| `source-serif-4`             | Source Serif 4             | Serif      |
| `literata`                   | Literata                   | Serif      |
| `fraunces`                   | Fraunces                   | Serif      |
| `source-sans-3`              | Source Sans 3              | Sans-serif |
| `inter`                      | Inter                      | Sans-serif |
| `ibm-plex-sans`              | IBM Plex Sans              | Sans-serif |
| `atkinson-hyperlegible-next` | Atkinson Hyperlegible Next | Sans-serif |
| `system-sans`                | The device's sans-serif    | Sans-serif |
| `system-serif`               | The device's serif         | Serif      |

### Layout (`personPage`)

| Field       | Values                                                                             |
| ----------- | ---------------------------------------------------------------------------------- |
| `columns`   | `1` or `2`.                                                                        |
| `sideWidth` | `narrow` (default) or `wide` (two equal columns); only with two columns.           |
| `sections`  | List in display order: `id`, optional `column` (`main`/`side`), optional `hidden`. |

Section ids: `briefing`, `contact`, `timeline`, `facts`, `relationships`,
`organizations`, `details`, `fields` (custom fields), `addresses`, `met`, `tags`.
Each may appear once. Sections you leave out keep their place from the Classic
layout, so a theme stays usable when later versions add sections.

### Custom CSS

`css` is added after the app's styles and can adjust anything the tokens do not
cover. It may not load anything from elsewhere, because Rekindly makes no external
calls: `@import` is rejected, and `url()` only accepts `data:` URLs. CSS that
depends on the app's internal class names can break with an update; prefer the
tokens where you can.

## Sharing themes

- Give the theme a clear `name`, a one-line `description` and your `author` name.
- Check both palettes; the contrast numbers in the editor help.
- A theme file contains no personal data, only design settings, so it is safe to
  share. Before importing someone else's file with custom CSS, have a look at it.
- Built-in themes can be exported too and are a good starting point.

## API

Themes are part of the API (see `/api/docs`): `GET /api/v1/themes` lists the built-in
and own themes, the layout templates and the instance defaults; `POST`, `PUT` and
`DELETE /api/v1/themes/{id}` manage own themes (`POST …/restore` undoes a delete), and
`PUT /api/v1/themes/defaults` sets the instance defaults. API tokens have no access.
