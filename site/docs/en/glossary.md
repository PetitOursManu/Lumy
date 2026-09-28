---
title: Glossary
description: The words this documentation uses, each defined once.
---

## Block {#block}

A part of a page written between `:::name` and `:::`, such as `:::steps` or `:::tabs`. Lumy turns it into something the reader can use: a checklist, a set of tabs, a quiz.

## Slug {#slug}

A page's name in addresses and links: its file path without `.md`. `docs/en/guide/setup.md` has the slug `guide/setup`; the home page's slug is `index`.

## Source language {#source-language}

The first language in `languages`: the one pages are written in first, and the one a page falls back to when it has no translation yet.

## Fallback page {#fallback}

A page shown in the source language because it has no translation in the reader's language. It carries a note saying so.

## Translation stamp {#stamp}

The `source_hash` recorded in a translation's front matter: a fingerprint of the source page it was made from. When the source changes, the stamp no longer matches and the translation is reported as outdated.

## MCP {#mcp}

Model Context Protocol: an open standard that lets an AI assistant use tools. `lumy mcp` gives an assistant tools to read and write your documentation.

## llms.txt {#llms-txt}

A plain-text index of a site, written for language models. Lumy writes it at the root of every build, with `llms-full.txt` holding every page.
