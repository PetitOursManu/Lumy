---
title: Lumy
navTitle: Introduction
description: Light, multilingual, interactive documentation. Write Markdown, get a fast static site.
---

Lumy turns a folder of Markdown files into a documentation site that loads at once, reads well on a phone, speaks several languages, and helps readers do what the page describes instead of only reading it.

:::cards cols=2
- [Getting started](getting-started.md) Create a site and preview it in two minutes.
- [Writing pages](writing.md) Markdown, plus blocks that make readers act: steps, tabs, quizzes.
- [Languages](languages.md) One folder per language, and a warning when a translation falls behind.
- [AI assistants](ai.md) Let Claude, or any MCP client, read and write your docs.
:::

## Why Lumy

- **Light.** Pages are plain HTML, built ahead of time. A reader downloads one stylesheet, one small script and the page itself. Nothing comes from a third-party CDN.
- **Easy to change.** Content is Markdown. Navigation, languages and colours live in one file, `lumy.config.json`.
- **Multilingual.** Readers land in their language and keep their place when they switch. An untranslated page falls back to the source language; an outdated translation says so.
- **Made for phones too.** The menu becomes a drawer, the table of contents a dropdown, and wide tables and code scroll on their own.
- **Interactive.** [[Blocks|block]] turn instructions into things to do: tick steps, choose a tab once for the whole site, type your own values into commands, explore an annotated screenshot, check your understanding.
- **Open to AI.** Every page is also served as Markdown, the site publishes `llms.txt`, and an [[MCP]] server lets an assistant write pages for you.

:::why Why another documentation tool?
Lumy started as the documentation of Mocky, which outgrew its first tool: the look took hundreds of lines of overrides, pages were fetched from GitHub on every visit, and nothing helped a reader act on what they read. Lumy keeps what was good about that setup, plain Markdown and no infrastructure, and builds the rest into the tool.
:::

## At a glance

| What | How |
|---|---|
| Output | Static HTML that any host can serve |
| Script sent to readers | One file, no framework |
| Dependencies | One Markdown parser, at build time only |
| Languages | Any; Lumy's own interface ships in English, French, Spanish, German, Italian and Portuguese |
| Accounts | None needed to read. Ever. |
| Licence | MIT |
