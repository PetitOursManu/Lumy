---
title: Getting started
description: Install the application and open it for the first time.
---

This page shows the blocks you will use most. Replace its content with your own.

## Install

:::tabs group=install
@tab Docker
```bash
docker run -p {{port}}:{{port}} my-app
```
@tab From source
```bash
npm install
npm start -- --port {{port}}
```
:::

:::vars
port = 8080 | Port
:::

## First run

:::steps id=first-run
1. **Open the app.** Go to `http://localhost:{{port}}`.
2. **Create an account.** The first account becomes the administrator.
3. **Change the settings.** Everything can be changed later.
:::

:::tip
Terms written like [[this|app]] are explained on hover. They are defined in `glossary.md`.
:::

:::quiz
Which account becomes the administrator?
- [x] The first one created
- The last one created
> The first account is the administrator.
:::
