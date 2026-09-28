---
title: Languages
description: One folder per language, readers in their own language, and a warning when a translation falls behind.
audience: [writer, admin]
---

## Choosing the languages

List them in `lumy.config.json`. The first one is the [[source language]]: the one pages are written in first, and the one others fall back to.

```json title="lumy.config.json"
{
  "languages": ["en", "fr", "de"]
}
```

Each language gets its own folder under `docs/`, with the same file names: `docs/en/install.md` and `docs/fr/install.md` are the same page in two languages. Any language code works; the language menu shows each language by its own name.

## What readers get

- On their first visit, readers land in the language their browser asks for, and Lumy remembers their choice after that.
- Switching language keeps them on the same page, at the same section.
- A page that is not translated yet still exists in every language. It shows the source text, with a note saying it is not translated yet, so links and the sidebar never break.
- Lumy's own interface (search, buttons, messages) comes in English, French, Spanish, German, Italian and Portuguese. For any other language, or to change a word, add a `ui` section to the configuration:

```json title="lumy.config.json"
{
  "ui": {
    "nl": { "search": "Zoeken", "searchPlaceholder": "Zoek in de documentatie…" }
  }
}
```

## Keeping translations current

A translation records which version of its source it was made from, as `source_hash` in its front matter. When the source page changes, the two stop matching: `lumy check` and `lumy translations` report the page, and readers see a note inviting them to read the source language.

:::steps id=translation-cycle
1. **See where things stand.** Missing, outdated and unverified pages, per language.
   ```bash
   npx lumy translations
   ```
2. **Update the translations.** Edit the files, or ask an AI assistant through [MCP](ai.md), which records the hash by itself.
3. **Mark them current.** For one page, a whole language, or everything.
   ```bash
   npx lumy translations --stamp fr/install
   npx lumy translations --stamp fr
   ```
:::

| Status | Meaning |
|---|---|
| current | The translation was made from the source as it is today |
| outdated | The source changed since; readers see a note |
| unverified | No `source_hash` yet: Lumy cannot tell |
| missing | No file in that language; readers get the source text |

A page that a script writes in every language at once, such as a changelog built from the git history, cannot fall behind: put `generated: true` in its front matter and it always counts as current.

:::why Why a hash and not the file dates?
Dates change when a repository is cloned, when a file is copied, or when someone fixes a typo in the translation itself. A hash of the source text changes only when the source text does, and it survives every copy.
:::
