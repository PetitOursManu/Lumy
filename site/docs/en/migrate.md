---
title: Moving from Docsify
description: Convert a Docsify site in one command, links and navigation included.
audience: [admin]
---

`lumy import docsify` reads a Docsify folder and writes a Lumy site next to it. The Docsify folder is not changed.

```bash
npx lumy import docsify ./docs --out ./docs-lumy --lang en,fr --title "My app"
```

`--lang` lists the languages, the source language first. Docsify keeps the source language at the root and the others in sub-folders (`fr/`) or in `page.fr.md` files; both are understood.

## What changes

| Docsify | Lumy |
|---|---|
| `README.md` | `index.md` |
| `fr/page.md`, `page.fr.md` | `docs/fr/page.md` |
| Links written from the site root | Links written from the file, like on GitHub |
| `_sidebar.md` | `nav` in lumy.config.json, group names taken from each language's sidebar |
| `?> text`, `!> text` | `:::tip`, `:::warning` |
| `<div data-…-widget="name">` | `:::widget name` |
| A line such as "English · Français" | Removed: Lumy draws the language menu |
| `#/page` addresses | Still work, with `"legacyHashRoutes": true` |

Headings anchors are rewritten too, so a link to `#première-utilisation` keeps pointing at the right section.

## Explanations as collapsible blocks

If your pages open sections with a bold label in a quote, such as `> **Why it works this way —** …`, `--why` turns those quotes into `:::why` blocks:

```bash
npx lumy import docsify ./docs --out ./docs-lumy --lang en,fr --why "Why it works this way,Pourquoi c'est ainsi"
```

## After the import

:::steps id=after-import
1. **Check the site.** Everything Docsify tolerated and Lumy does not is listed.
   ```bash
   npx lumy check --root ./docs-lumy
   ```
2. **Mark the translations current.** The import cannot know which translations were up to date; if they all were, say so once.
   ```bash
   npx lumy translations --root ./docs-lumy --stamp all
   ```
3. **Tidy the navigation.** The sidebar is converted as it was; groups are often worth renaming now.
4. **Port your widgets.** Register each `:::widget` with `Lumy.widget(name, fn)` in a script listed under `scripts`.
:::
