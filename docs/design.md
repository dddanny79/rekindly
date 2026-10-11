# Design

Binding visual reference for the web app. Direction: **“Typesetting & tool”** —
content is set like a well-made newspaper column, controls are a quiet tool.
Derived from the design exploration of 2026-10-11 (kept outside the repository).

## Principles

- **Content in serif, controls in sans.** Names, headings, lead text, notes: Newsreader.
  Navigation, labels, data, buttons: Source Sans 3.
- **Rules instead of cards.** Structure comes from lines and whitespace, not boxes.
  No shadows on page content; only overlays (command palette, sheets, menus) get one.
- **One signal colour, the “red pencil”** (`signal`): only for things that are due,
  the active position and search hits. Never as hover or decoration.
- **Dense, not cramped.** Much information at a glance; generous line height.
- **Dark mode is its own palette:** cool near-black instead of inverted paper,
  warm white as ink, signal and space colours lightened, not mirrored.
- **Keyboard first:** focus is always visible; shortcuts are shown as small `kbd` hints.

Not wanted: gradients, glassmorphism, glow, floating cards with big shadows, tile
grids, emoji as icons, hero sections, illustrations, dashboard charts.

## Colour tokens

Contrast measured against `background`. AA = 4.5:1 for text, 3:1 for controls.

| Token (CSS variable)                   | Light       | Dark        | Contrast L / D | Use                                            |
| -------------------------------------- | ----------- | ----------- | -------------- | ---------------------------------------------- |
| `--background`                         | `#FAF9F6`   | `#121314`   | —              | Page background, no paper texture              |
| `--foreground` · `--primary`           | `#141414`   | `#EAE6DE`   | 17.5 / 14.8    | Text, primary button fill, rules               |
| `--foreground-2`                       | `#3B3A36`   | `#C6C1B7`   | 10.8 / 10.2    | Sub-lines, secondary navigation                |
| `--muted` · `--accent` · `--secondary` | `#F1EEE6`   | `#1C1D1F`   | surface        | Hover, active row, palette footer              |
| `--muted-foreground`                   | `#5C5A54`   | `#A09B90`   | 6.6 / 6.7      | Dates, meta lines, labels                      |
| `--popover` · `--card`                 | `#FFFFFF`   | `#1B1C1E`   | surface        | ⌘K, sheets, input fields                       |
| `--border`                             | `#D6D2C8`   | `#34332F`   | decorative     | Hairlines between rows                         |
| `--border-strong`                      | `#141414`   | `#8C877D`   | 17.5 / 5.1     | Section rules, double rule, segmented controls |
| `--input`                              | `#8A867C`   | `#6E6A62`   | 3.4 / 3.4      | Border of inputs and secondary buttons         |
| `--ring`                               | `#141414`   | `#EAE6DE`   | 17.5 / 14.8    | Focus ring                                     |
| `--signal`                             | `#B23A1C`   | `#F08A6C`   | 5.7 / 7.5      | Due, counters, active position                 |
| `--signal-tint`                        | `#F6E1D8`   | `#3A231C`   | surface        | Search hit highlight (`mark`)                  |
| `--destructive`                        | `#A3231A`   | `#FF8A7A`   | 7.1 / 8.1      | Delete, error messages                         |
| `--area-private`                       | `#53632A`   | `#B9C67E`   | 6.2 / 10.2     | Space dot, initials, kicker                    |
| `--area-business`                      | `#2A4869`   | `#93B3D8`   | 9.1 / 8.4      | Space dot, initials, kicker                    |
| `--overlay`                            | `#14141466` | `#0000009E` | —              | Scrim behind ⌘K and sheets                     |

Spaces pick a colour from a palette of six; each key maps to a token with light/dark
values (all ≥ 6:1 against the background):

| Palette key | Token           | Light     | Dark      |
| ----------- | --------------- | --------- | --------- |
| `olive`     | `--space-olive` | `#53632A` | `#B9C67E` |
| `navy`      | `--space-navy`  | `#2A4869` | `#93B3D8` |
| `plum`      | `--space-plum`  | `#6E3A62` | `#D6A8CB` |
| `teal`      | `--space-teal`  | `#1F5F5A` | `#86C9C1` |
| `ochre`     | `--space-ochre` | `#7A5410` | `#DDBB6E` |
| `slate`     | `--space-slate` | `#4A5058` | `#B6BCC4` |

`--area-private` / `--area-business` are aliases of olive / navy (the seeded spaces).

`--primary` is the ink (primary button filled dark). `--accent` stays the shadcn hover
surface and points to `--muted`. The red pencil is its own token `--signal` so it never
shows up as a hover colour by accident. Space colours are assigned per space later;
the two above are the defaults for the first two spaces.

In Tailwind every token is available as a colour utility, e.g. `text-foreground-2`,
`border-border-strong`, `text-signal`, `bg-signal-tint`, `bg-area-private`.

## Typography

| Font          | Use                               | Weights                 | Variable       |
| ------------- | --------------------------------- | ----------------------- | -------------- |
| Newsreader    | Names, headings, lead text, notes | 400 / 500 / 600, italic | `--font-serif` |
| Source Sans 3 | Controls, labels, data            | 400–700                 | `--font-sans`  |

Both are SIL Open Font License, bundled via `@fontsource-variable` (no CDN).

| Utility        | Size / line height · weight      | Example                                  |
| -------------- | -------------------------------- | ---------------------------------------- |
| `text-display` | 56 / 1.0 · 500 · −2.5 %          | Person name (desktop)                    |
| `text-title`   | 40 / 1.05 · 500 · −2 %           | Page title, person name on mobile        |
| `text-h2`      | 30 / 1.2 · 500                   | Entry heading                            |
| `text-lead`    | 22 / 1.4 · 400 (mobile 18)       | Briefing text                            |
| `text-deck`    | 21 / 1.4 · italic                | “Leitung Einkauf @ Beispiel GmbH › Köln” |
| `text-read`    | 17 / 1.5 · 400                   | Notes, timeline text                     |
| `text-base`    | 15 / 1.5 · 400–700               | Body text of the UI                      |
| `text-sm`      | 14 / 1.45 · 400–600              | Buttons                                  |
| `text-meta`    | 13 / 1.45 · muted                | “02.10.2026 · 14:20 · 18 Min.”           |
| `text-label`   | 12 · 700 · caps · +12 % tracking | Section labels (“Briefing”, “Verlauf”)   |
| `text-kbd`     | 11 · 600 · bordered              | `⌘K` `J` `K` `Esc`                       |

Serif sizes (`display`, `title`, `h2`, `lead`, `deck`, `read`) are combined with
`font-serif`. Helper classes: `.kicker` (label style), `.kbd` (key hint), `.num`
(tabular, lining figures — use for every date, time, phone number and counter).

Wrapping: `lang` is set on `<html>`, `hyphens: auto` and `overflow-wrap: break-word`
are on by default, so long German words (“Kontaktrhythmus”, “Wiedervorlagen”) break
cleanly even in narrow columns.

## Spacing, radii, shadows

- 4 px grid (Tailwind default `--spacing: 0.25rem`).
- List rows 8–10 px vertical padding, sections 24–36 px apart, page margin 44 px
  desktop / 18 px mobile. Touch targets at least 44 px.
- Radii: `0` for rules and surfaces, `3px` (`rounded-sm`/`rounded-md`) for inputs
  and buttons, `8px` (`rounded-lg`) for the top of a bottom sheet, `full` for
  initials and radio buttons.
- Shadow only on overlays: `shadow-overlay` = `0 18px 48px rgb(0 0 0 / .22)`, plus a
  1 px `border-strong` border and the `--overlay` scrim.

## Rules (lines)

| Line                        | Use                                     |
| --------------------------- | --------------------------------------- |
| 1 px `border`               | Between rows                            |
| 1 px `border-strong`        | Under section headings                  |
| 2 px `foreground`           | Active tab, box header                  |
| 3 px double `border-strong` | End of the page header (`.rule-double`) |

## Initials

Newsreader italic on the space colour, text in `background`, round.

## States

Focus is always a 2 px ring in `ring` with 2 px offset, visible via `:focus-visible`
(also after mouse interaction where the browser shows it).

**Buttons** (height 36 px, padding 0 14 px, radius 3 px, 14 px text)

| Variant     | Default                                            | Hover                                 | Disabled                                               |
| ----------- | -------------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| Primary     | fill + border `foreground`, text `background`, 600 | fill `foreground-2`                   | border `border`, fill `muted`, text `muted-foreground` |
| Secondary   | border `input`, transparent, text `foreground`     | border `foreground`, fill `muted`     | dashed `border`, text `muted-foreground`               |
| Ghost       | transparent, text `foreground-2`                   | fill `muted`, text `foreground`       | text `muted-foreground`, struck through                |
| Destructive | border + text `destructive`, 600                   | fill `destructive`, text `background` | only inside a confirmation dialog                      |

Shortcuts sit inside the button as `kbd` (“Anrufen `C`”).

**Inputs** (height 38 px, padding 0 10 px, radius 3 px, 15 px, fill `popover`, border `input`)
— hover: border `foreground-2`; focus: border `foreground` + ring; error: 1.5 px
`destructive` border + message in `destructive` (12.5 px); disabled: fill `muted`, text
`muted-foreground`, border `border`. The capture field uses serif italic 17 px.

**List rows** — default: hairline below; hover: fill `muted`; active: fill `muted` + 2 px
`signal` bar on the left (inset shadow), bold; keyboard (J/K): ring inset −2 px with
`↵` hint; done: text `muted-foreground`, struck through, “undo” link.

**Timeline entries** — date column (bold date, meta type with ↙/↗ for in/out), text in
serif 16–17 px; hover: fill `muted` with `P` (pin) and `E` (edit) hints.

**Navigation** — active item: fill `muted`, bold, 2 px `signal` bar on the left
(desktop) or on top (mobile tab bar); counters in `muted-foreground`, due counters in
`signal`.

## Theme

Light and dark follow the system preference by default. Users can override it per
device (Settings and the mobile More page: segmented control **System / Light / Dark**,
stored in `localStorage`). The resolved theme is set as `<html data-theme="light|dark">`
before first paint; dark tokens and Tailwind's `dark:` variant key off that attribute.

## App shell

- **Desktop (≥ md):** left sidebar ~236 px with the app name (serif italic 25 px, 600),
  a search field with `⌘K` hint, navigation (Today, People, Organizations, Settings),
  space switcher, and at the bottom the user and the language toggle (“DE · EN”).
  Main column with 44 px side padding.
- **Mobile:** top bar with the app name (serif italic 21 px) and the space switcher;
  bottom tab bar (Today, People, Search, More), 56 px high, `border-strong` on top.
  “More” lists Organizations, Settings, language, appearance, and the version.
- **Page header:** kicker (`text-label`, muted), serif title, optional italic lead,
  closed by the 3 px double rule.
