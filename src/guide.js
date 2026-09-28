/**
 * The authoring guide an AI assistant receives through MCP (tool
 * "get_guide"), so it writes pages the way Lumy expects.
 */
export const AUTHORING_GUIDE = `# Writing pages for a Lumy site

## Files
- One folder per language under the docs folder: docs/en/, docs/fr/… Same file name in every language.
- docs/<lang>/index.md is the home page. A page's slug is its path without ".md": docs/en/guide/setup.md → "guide/setup".
- Shared images live in docs/assets/. From docs/en/page.md, link them as ../assets/image.png (or /assets/image.png).
- docs/<lang>/glossary.md holds glossary terms: one "## Term {#key}" section each, first paragraph = definition.
- The sidebar order is "nav" in lumy.config.json (use the set_nav tool). A page not in nav still exists and is searchable.

## Front matter
---
title: Getting started          # the page title (otherwise the first "# Heading")
description: One sentence.      # shown under the title and in search and llms.txt
audience: [user, admin]         # optional, for the reader-profile filter
badge: New                      # optional sidebar badge
navTitle: Install               # optional shorter sidebar label
---
Translations get "source_hash" automatically when written through write_page. Do not invent it.

## Markdown
GitHub-flavoured Markdown: tables, task lists, fenced code with a language. Code fences accept a title and marked lines:
\`\`\`bash title="Terminal" {2}
npm install
npm run dev
\`\`\`
"## Heading {#custom-id}" fixes a heading id. Link other pages with relative paths to their .md file: [Deploy](deployment.md#health).

## Blocks (open with :::name, close with a line containing only :::)
:::note | :::tip | :::info | :::warning | :::danger | :::success   Optional title after the name.
:::why Why is the port bound to 127.0.0.1?     A collapsible "why it is this way" explanation.
:::details Title                               A plain collapsible block.
:::tabs group=install                          Tabs; one "@tab Label" line starts each tab ("@tab Label {#key}" fixes the key, e.g. in translations). Same group = same choice everywhere, remembered.
@tab Docker
…
@tab Node
…
:::
:::steps id=first-run                          A checklist the reader ticks; an ordered list, "**Title.** text" per item.
1. **Open the app.** Details…
2. **Create the first account.** Details…
:::
:::vars                                        Values the reader types once; {{key}} anywhere on the page (text, inline code, code blocks) shows them.
host = localhost | Server address
port = 8080 | Port
:::
:::hotspots src=../assets/screen.png alt="Main screen"   Numbered points on a screenshot, x,y in percent of width/height.
- 12,8 **Menu**: what it does.
- 50,90 **Composer**: what it does.
:::
:::quiz                                        A one-question check. "- [x]" marks the right answer, "> " the explanation, "?> " a hint.
Who becomes administrator?
- The account that enters the API key
- [x] The first account created
> The first account is the administrator.
:::
:::cards cols=2                                Link cards: "- [Title](link) description".
- [Install](install.md) Get it running in five minutes.
:::
:::widget name key=value                       A site-specific interactive block (the site's script registers it); the body is the fallback.
:::
GitHub alerts (> [!NOTE], > [!TIP], > [!WARNING], > [!CAUTION], > [!IMPORTANT]) render as callouts.

## Glossary
[[Term]] links a term defined in glossary.md; [[shown text|key]] shows different text. Readers get the definition on hover or tap.

## Style
- Write for the reader: task first, reasons after (use :::why for reasons).
- One idea per paragraph; short sentences; real values, never placeholders like "foo".
- Keep every language in step: after changing a page in the default language, update its translations (translation_status lists them).
`
