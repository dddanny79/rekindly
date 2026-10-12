# Logo

| File                                  | Use                                              |
| ------------------------------------- | ------------------------------------------------ |
| `rekindly-mark.png`                   | The sign alone: icons, avatars, small spaces     |
| `rekindly-wordmark.png` / `-dark.png` | Sign with the name; `-dark` for dark backgrounds |
| `rekindly-subtitle.png` / `-dark.png` | Sign, name and “Personal CRM”                    |

All PNGs have a transparent background. They are built from the originals in
`source/` (white background) with `node scripts/brand.mjs`, which also writes the
web app's copies (`apps/web/src/assets/brand`), the favicons and the home screen
icons (`apps/web/public`).
