---
title: Configuration
description: Every setting of lumy.config.json.
audience: [admin]
---

`lumy.config.json` sits at the root of the site. Only `title` is needed; everything else has a default.

```json title="lumy.config.json"
{
  "title": "My app",
  "description": "What my app does, in one sentence.",
  "languages": ["en", "fr"],
  "logo": "assets/logo.svg",
  "theme": { "brand": "#4f46e5" },
  "github": "https://github.com/me/my-app",
  "editUrl": "https://github.com/me/my-app/edit/main/docs/{path}",
  "nav": [
    { "group": { "en": "Get started", "fr": "Démarrer" }, "pages": ["index", "install"] },
    { "group": "Reference", "pages": ["api", { "label": "Changelog", "link": "https://github.com/me/my-app/releases" }] }
  ]
}
```

## Site

| Key | Default | What it does |
|---|---|---|
| `title` | `Documentation` | The site's name, in the header and the browser tab |
| `description` | | Used when a page has none of its own, and in `llms.txt` |
| `url` | | The public address, such as `https://docs.example.com`. Enables canonical links and `sitemap.xml` |
| `base` | `/` | The path the site is served under, such as `/docs/` |
| `version` | | A small label beside the title |
| `logo`, `favicon` | | Paths inside the docs folder, such as `assets/logo.svg` |
| `docsDir`, `outDir` | `docs`, `dist` | Where pages are read and the site is written |

## Look

| Key | Default | What it does |
|---|---|---|
| `theme.brand` | `#20796c` | The one colour of the interface: links, current page, buttons |
| `theme.brandDark` | derived | The same colour for the dark theme; lightened from `brand` when absent |
| `theme.radius` | `12` | Corner radius of blocks, in pixels |
| `styles` | `[]` | Your own stylesheets, paths from the site root |
| `scripts` | `[]` | Your own scripts, for site widgets |

Readers choose light or dark; by default the site follows their system.

## Navigation

| Key | What it does |
|---|---|
| `nav` | Groups of pages for the sidebar. A group's label is text, or one text per language. A page is its slug (`index` for the home page), or `{ "label", "link" }` for an outside link. Without `nav`, one group per folder. |
| `links` | Links in the header: `{ "label", "href" }`, where `href` is a page slug or an address |
| `audiences` | Reader profiles for the sidebar filter: `{ "id", "label" }`. Pages declare theirs with `audience` in their front matter. |

## Languages

| Key | Default | What it does |
|---|---|---|
| `languages` | `["en"]` | Language codes, or `{ "code", "label" }`. The first is the source language. |
| `ui` | | Your own wording for Lumy's interface, per language |

## Links out

| Key | What it does |
|---|---|
| `github` | Adds a GitHub button to the header |
| `editUrl` | "Edit this page" address; `{path}` is the file inside the docs folder |
| `issuesUrl` | "Report an issue" address |
| `outsideDocsUrl` | Where links to files outside the docs folder go, such as source code on GitHub |

## Features

| Key | Default | What it does |
|---|---|---|
| `search` | `true` | Search box and Ctrl K |
| `llms` | `true` | Writes `llms.txt` and `llms-full.txt` |
| `feedback` | `false` | "Was this page helpful?" at the end of pages. Votes are stored by `lumy serve`, or sent to the address you give. |
| `assistant` | `false` | The "Ask AI" panel. Needs `lumy serve`, or an address that answers. |
| `mcp` | `false` | Shows readers the address of a remote MCP server for the site |
| `legacyHashRoutes` | `false` | Sends old `#/page` addresses, from Docsify, to the right page |
