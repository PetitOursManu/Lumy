---
title: Writing pages
description: Markdown, plus a handful of blocks that turn instructions into things readers do.
audience: [writer]
---

A page is a Markdown file. Everything GitHub understands works here: headings, lists, tables, links, images, task lists, fenced code. On top of that, Lumy adds blocks that open with `:::name` and close with a line holding only `:::`.

Each example below has two tabs. **Result** is what readers see, **Markdown** is what you write. Pick one and every example on the page follows.

## Front matter

Optional settings at the top of a page, between two `---` lines.

```yaml title="docs/en/install.md"
---
title: Install            # otherwise the first "# Heading" is the title
description: One sentence, shown under the title and in search.
navTitle: Install         # a shorter label for the sidebar
audience: [writer, admin] # for the reader-profile filter
badge: New                # a small badge in the sidebar
---
```

## Callouts

:::tabs group=view
@tab Result
:::note
Notes carry information the reader should not miss.
:::
:::tip Faster
Tips save time. A title after the block name is optional.
:::
:::warning
Warnings prevent mistakes that cost something.
:::
:::danger
Danger is for what cannot be undone.
:::
@tab Markdown
````md
:::note
Notes carry information the reader should not miss.
:::

:::tip Faster
Tips save time. A title after the block name is optional.
:::

:::warning
Warnings prevent mistakes that cost something.
:::

:::danger
Danger is for what cannot be undone.
:::
````
GitHub alerts work too: `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!CAUTION]`, `> [!IMPORTANT]`.
:::

## Explanations that stay out of the way

`:::why` holds the reasoning behind an instruction. The instruction stays short; the reason is one click away. `:::details` is the same, without the "why" label.

:::tabs group=view
@tab Result
Lumy writes the search index to a separate file.

:::why Why not put it in every page?
The index covers the whole site. Loading it only when a reader opens the search keeps every page light, and the file is cached after the first search.
:::
@tab Markdown
````md
Lumy writes the search index to a separate file.

:::why Why not put it in every page?
The index covers the whole site. Loading it only when a reader opens
the search keeps every page light, and the file is cached after the
first search.
:::
````
:::

## Tabs

One `@tab Label` line starts each tab. With `group=name`, every tab block of that group switches together, on this page and the next ones: a reader who picks "Windows" once sees Windows everywhere.

:::tabs group=view
@tab Result
:::tabs group=os
@tab macOS
```bash
brew install node
```
@tab Windows
```bash
winget install OpenJS.NodeJS
```
@tab Linux
```bash
sudo apt install nodejs
```
:::
@tab Markdown
````md
:::tabs group=os
@tab macOS
```bash
brew install node
```
@tab Windows
```bash
winget install OpenJS.NodeJS
```
@tab Linux
```bash
sudo apt install nodejs
```
:::
````
:::

## Steps

A numbered list inside `:::steps` becomes a checklist. Readers tick steps as they go; their progress is kept in their browser. The bold text at the start of each item is its title.

:::tabs group=view
@tab Result
:::steps id=demo
1. **Create the folder.** Any empty folder will do.
2. **Run init.** It writes the configuration and a first page.
3. **Start the preview.** Leave it running while you write.
:::
@tab Markdown
````md
:::steps id=demo
1. **Create the folder.** Any empty folder will do.
2. **Run init.** It writes the configuration and a first page.
3. **Start the preview.** Leave it running while you write.
:::
````
:::

## Your values in commands

`:::vars` declares values a reader types once. Everywhere the page writes `{{key}}`, in text, in inline code or inside a code block, the reader's value appears, and "Copy" copies the command ready to run. Values are remembered across pages.

:::tabs group=view
@tab Result
:::vars
domain = docs.example.com | Your domain
port = 8080 | Port
:::

```bash
curl -I https://{{domain}}:{{port}}/
```
@tab Markdown
````md
:::vars
domain = docs.example.com | Your domain
port = 8080 | Port
:::

```bash
curl -I https://{{domain}}:{{port}}/
```
````
:::

## Annotated screenshot

`:::hotspots` places numbered points on an image. Each line gives the point's position, in percent of the image's width and height, then its title and text. Readers click the points or take the tour with **Next**. Without JavaScript, the annotations show as a list.

:::tabs group=view
@tab Result
:::hotspots src=../assets/lumy-page.png alt="A page of the Mocky documentation, built with Lumy"
- 79.5,3.1 **Search**: Ctrl K anywhere. Typos are forgiven and results appear as you type.
- 91.6,3.1 **Language and theme**: switching language keeps the reader on the same page; the theme follows the system until the reader picks one.
- 9.3,13.5 **Reader profile**: readers can hide the pages that are not for them. Each page lists its audience in its front matter.
- 9.3,25.9 **Navigation**: from `nav` in lumy.config.json. The sidebar keeps its scroll position from page to page.
- 71.1,20.5 **Copy page**: the page as Markdown, for an AI assistant, plus the page source and the MCP address.
- 88.5,11.7 **On this page**: follows the reading position. On a phone it becomes a dropdown under the header.
:::
@tab Markdown
````md
:::hotspots src=../assets/lumy-page.png alt="A page built with Lumy"
- 79.5,3.1 **Search**: Ctrl K anywhere. Typos are forgiven…
- 91.6,3.1 **Language and theme**: switching language keeps…
- 9.3,13.5 **Reader profile**: readers can hide the pages…
- 9.3,25.9 **Navigation**: from `nav` in lumy.config.json…
- 71.1,20.5 **Copy page**: the page as Markdown…
- 88.5,11.7 **On this page**: follows the reading position…
:::
````
:::

:::tip Finding the coordinates
Open the image in any viewer that shows the cursor position, and divide by the image's width and height. `50,50` is the centre.
:::

## Quiz

A question to check understanding. `- [x]` marks the right answer, a `>` line holds the explanation shown when the reader finds it, and an optional `?>` line gives a hint after a wrong answer.

:::tabs group=view
@tab Result
:::quiz
A French page has no `source_hash` in its front matter. How is it reported?
- Outdated
- [x] Unverified
- Missing
> Without a hash, Lumy cannot compare the translation with its source, so it cannot say it is current or outdated.
?> The page exists, so it is not missing.
:::
@tab Markdown
````md
:::quiz
A French page has no `source_hash` in its front matter. How is it reported?
- Outdated
- [x] Unverified
- Missing
> Without a hash, Lumy cannot compare the translation with its source…
?> The page exists, so it is not missing.
:::
````
:::

## Cards

Links presented as a grid, for home pages and overviews. `cols` sets the number of columns on wide screens.

:::tabs group=view
@tab Result
:::cards cols=2
- [Languages](languages.md) Folders, fallbacks and translation status.
- [Deploy](deploy.md) Any static host, or `lumy serve`.
:::
@tab Markdown
````md
:::cards cols=2
- [Languages](languages.md) Folders, fallbacks and translation status.
- [Deploy](deploy.md) Any static host, or `lumy serve`.
:::
````
:::

## Glossary

Terms are defined once, in `docs/<lang>/glossary.md`, as `## Term {#key}` sections. In any page, `[[Term]]` shows the definition on hover or tap, and `[[other words|key]]` does the same with different text. The glossary page itself is searchable like any page.

:::tabs group=view
@tab Result
Lumy renders [[blocks|block]] ahead of time and ships an [[MCP]] server.
@tab Markdown
````md
Lumy renders [[blocks|block]] ahead of time and ships an [[MCP]] server.
````
````md title="docs/en/glossary.md"
## Block {#block}

A part of a page written between `:::name` and `:::`…
````
:::

## Code

Fenced code gets a copy button and syntax colours for common languages (shell, JavaScript and TypeScript, JSON, YAML, CSS, HTML, Python, SQL, Dockerfile, INI and .env, diff). After the language you can give a title and lines to highlight.

:::tabs group=view
@tab Result
```js title="lumy.config.js" {2}
export default {
  title: 'My app',
}
```
@tab Markdown
````md
```js title="lumy.config.js" {2}
export default {
  title: 'My app',
}
```
````
:::

## Links and images

Link other pages by their file, relative to the current one: `[Deploy](deploy.md#github-pages)`. Lumy turns it into the right address in every language, and `lumy check` reports links that lead nowhere. Images go in `docs/assets/`; from a page, write `../assets/picture.png`. Their size is read at build time so the text does not jump while they load, and readers can enlarge them.

## Site widgets

For something only your application needs, such as a live list read from your own data, write a block with a name and a fallback:

```md
:::widget presets source=styles
The presets are listed on the Design page of the application.
:::
```

Then register it in a script listed under `scripts` in `lumy.config.json`:

```js title="widgets.js"
Lumy.widget('presets', (el, { lang, attrs }) => {
  el.textContent = `Loading ${attrs.source} in ${lang}…`
})
```

The fallback text is what search indexes and what readers without JavaScript see.
