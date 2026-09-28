---
title: Getting started
description: Create a documentation site, preview it with live reload, and build it.
audience: [writer, admin]
---

## Requirements

Node.js 22 or later. Nothing else: no database, no global install, no account.

## Install

Pick how you want to run Lumy. Your choice is remembered on every page of this site.

:::tabs group=install
@tab npm
```bash
npm install --save-dev lumy-docs
```
@tab pnpm
```bash
pnpm add -D lumy-docs
```
@tab From GitHub
```bash
npm install --save-dev github:PetitOursManu/Lumy
```
:::

The command is called `lumy` once installed: `npx lumy dev`, `npx lumy build`.

## Your first site

:::vars
port = 4000 | Preview port
:::

:::steps id=first-site
1. **Create the site.** In an empty folder, write the configuration and a first page in each language you list.
   ```bash
   npx lumy init --lang en,fr --title "My app"
   ```
2. **Start the preview.** Open the address it prints. Every time you save a file, the page reloads.
   ```bash
   npx lumy dev --port {{port}}
   ```
   Then open `http://localhost:{{port}}/`.
3. **Write.** Edit `docs/en/index.md`, add pages beside it, and list them under `nav` in `lumy.config.json`. [Writing pages](writing.md) shows everything a page can hold.
4. **Build.** The whole site lands in `dist/`, ready for any static host.
   ```bash
   npx lumy build
   ```
:::

:::tip
Run `npx lumy check` before publishing. It lists broken links, missing images, unknown blocks and translations that fell behind, and exits with an error code when something is wrong, so it can guard a CI pipeline.
:::

## What is in a site

```text title="my-docs/"
lumy.config.json      title, languages, navigation, colours
docs/
  assets/             images shared by every language
  en/
    index.md          the home page
    getting-started.md
    glossary.md       optional: terms explained on hover
  fr/
    index.md          same file names in every language
dist/                 the built site (lumy build)
```

A site with a single language may put its pages straight into `docs/`.

## Commands

| Command | What it does |
|---|---|
| `lumy init [folder]` | Creates a site: configuration and first pages |
| `lumy dev` | Preview with live reload |
| `lumy build` | Writes the static site to `dist/` |
| `lumy serve` | Serves the site with its dashboard, assistant and MCP server |
| `lumy check` | Reports broken links, missing images, unknown blocks |
| `lumy translations` | Shows missing and outdated translations; `--stamp` marks them current |
| `lumy mcp` | Lets an AI assistant read and write the docs |
| `lumy import docsify <folder>` | Converts a Docsify site |

:::quiz
You changed a page and want to see it. What do you run?
- `lumy build`, then open `dist/`
- [x] Nothing: `lumy dev` reloads the page on save
- `lumy check`
> `lumy dev` rebuilds and reloads the open page each time a file changes. Build only to publish.
:::
