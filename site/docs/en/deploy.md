---
title: Deploy
description: Publish the built site on any static host, or serve it yourself with lumy serve.
audience: [admin]
---

`lumy build` writes a folder of plain files. Anything that serves files can host it.

## GitHub Pages

This workflow rebuilds the site each time a page changes on the main branch.

```yaml title=".github/workflows/docs.yml"
name: Docs
on:
  push:
    branches: [main]
    paths: ['docs/**', 'lumy.config.json']
permissions:
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # full history, for "Updated on" dates
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx lumy check
      - run: npx lumy build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v4
```

:::note
When the site lives at `https://me.github.io/my-app/`, set `"base": "/my-app/"` in the configuration.
:::

## Your own server

:::vars
domain = docs.example.com | Domain
:::

:::tabs group=server
@tab nginx
```nginx title="/etc/nginx/sites-available/docs"
server {
  server_name {{domain}};
  root /var/www/docs/dist;
  location / { try_files $uri $uri/ =404; }
  location /_lumy/ { expires 1y; add_header Cache-Control "public, immutable"; }
  error_page 404 /404.html;
}
```
@tab lumy serve
```bash
npx lumy build
npx lumy serve --host 0.0.0.0 --port 4000
```
Then point your reverse proxy for `{{domain}}` at port 4000.
@tab Dashy
Zip the contents of `dist/` and import the `.zip` in Dashy as a static app. Set `base` in the configuration to the path Dashy serves the app under, then build again before zipping.
:::

## lumy serve

`lumy serve` serves `dist/` and handles the parts a static host cannot:

- **Feedback.** With `"feedback": true`, answers to "Was this page helpful?" are written, one per line, to `.lumy/feedback.jsonl`: the page, the answer, the optional comment and the time. No account, no cookie, and at most 20 votes a minute from one address.

It listens on `127.0.0.1` unless you pass `--host 0.0.0.0`, so it is only reachable from outside when you decide it should be.

:::why Why do theme files have a hash in their name?
Browsers keep stylesheets and scripts for a long time. When their content changes, their name changes with it, so a reader never gets a new page with an old stylesheet, and the server can tell browsers to keep the files for a year.
:::
