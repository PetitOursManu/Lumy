---
title: Server and dashboard
navTitle: Server and dashboard
description: lumy serve adds a dashboard, accounts, private documentation, the reader assistant and a remote MCP server.
audience: [admin]
---

A static build is enough for a public documentation. `lumy serve` adds what a static host cannot do, all switched from a dashboard in the browser:

- **Reader feedback**, stored and summarised page by page.
- **The assistant**, which answers readers from the documentation with the model of your choice.
- **A remote MCP server**, so assistants can read the docs, and write them with a token.
- **Accounts**, for the people who run the site and, when you want it, **private documentation**.

Reading a public site never needs an account.

## Start it

:::tabs group=serve
@tab Node
```bash
npx lumy serve --host 0.0.0.0 --port 4000 --watch
```
`--watch` rebuilds the site when a page changes on disk, after a `git pull` for instance.
@tab Docker
```bash
docker compose up -d
```
With the `docker-compose.example.yml` of the repository, copied next to your `lumy.config.json`. See [Docker](#docker) below.
:::

Then open `/_lumy/setup` on your site: the first account you create is the administrator. After that, the dashboard lives at `/_lumy/admin`.

:::why Why does the first visitor become administrator?
There is nobody else to ask. That is also why `lumy serve` listens on `127.0.0.1` until you pass `--host`: create the administrator before opening the server to the network, or create it from the environment with `LUMY_ADMIN_USER` and `LUMY_ADMIN_PASSWORD`.
:::

## The dashboard

:::cards cols=3
- [Overview](#the-dashboard) Pages, translations, feedback and the last build, with its warnings.
- [Feedback](#the-dashboard) Votes and comments per page, the least helpful first.
- [Assistant](#the-assistant) The provider, the model, the key, and a test button.
- [Access](#accounts-and-access) Who can read, who can sign up, the accounts.
- [MCP](#remote-mcp) The server's address and access tokens.
- [Account](#the-dashboard) Your password.
:::

## Accounts and access

| Role | Can |
|---|---|
| Administrator | Everything: settings, accounts, the assistant's keys |
| Editor | See the overview and feedback, create MCP tokens to write pages |
| Reader | Read a private documentation |

- **Who can read.** Public: anyone, no account. Private: signed-in accounts only; every page, the search index and `llms.txt` are closed to others.
- **Sign-ups.** Closed by default: the administrator adds accounts. Open: anyone can create one, with the role you choose (reader or editor).

Passwords are hashed with scrypt, sessions last 30 days and are extended while used, and sign-in attempts are limited to ten a minute per address.

## The assistant

Readers open **Ask AI**, type a question, and get an answer written from the sections of the documentation that match it best, with the sources as links. Only those sections are sent to the model, never the whole site.

| Provider | Default model | Key |
|---|---|---|
| Ollama (cloud or local) | `gpt-oss:120b` | Ollama Cloud key; none for a local Ollama |
| OpenAI | `gpt-4o-mini` | OpenAI key |
| Anthropic | `claude-haiku-4-5` | Anthropic key |
| Google (Gemini) | `gemini-2.5-flash` | Google AI Studio key |
| OpenRouter | `openai/gpt-4o-mini` | OpenRouter key |
| fal.ai | `openai/gpt-4o-mini` | fal key (`id:secret`) |
| Mistral | `mistral-small-latest` | Mistral key |
| Groq | `llama-3.3-70b-versatile` | Groq key |
| OpenAI-compatible | yours | if your server wants one: LM Studio, vLLM, LocalAI, Together… |

:::steps id=assistant-setup
1. **Choose a provider.** In the dashboard, under Assistant.
2. **Fill the model and the key.** The address is already right for every provider but the last one.
3. **Test.** The dashboard sends a one-word question and shows the answer time, or the provider's error.
4. **Switch it on and save.** "Ask AI" appears on every page after the next build, a second later.
:::

Keys are encrypted on the server (AES-256-GCM) with `LUMY_SECRET`, or with a key created in the data folder when it is not set. They are never sent to a browser. Each visitor may ask 30 questions an hour by default; the dashboard changes it.

## Remote MCP

The server answers MCP clients at `/_lumy/mcp` (Streamable HTTP). On a public site anyone may use the reading tools, as anyone may read the pages. Writing (`write_page`, `set_nav`) needs a token created in the dashboard, and the site is rebuilt after each change.

:::vars
site = docs.example.com | Your site
:::

```bash
claude mcp add --transport http docs https://{{site}}/_lumy/mcp --header "Authorization: Bearer lumy_…"
```

A token is shown once. Revoke it from the dashboard when a device is lost.

## Docker

```yaml title="docker-compose.yml"
services:
  lumy:
    build: https://github.com/PetitOursManu/Lumy.git
    ports:
      - "127.0.0.1:4000:4000"
    volumes:
      - ./:/site          # lumy.config.json and docs/
      - lumy-data:/data   # accounts, settings, feedback, built site
    environment:
      LUMY_SECRET: change-me-to-a-long-random-string
    restart: unless-stopped
volumes:
  lumy-data:
```

Put a reverse proxy in front for `{{site}}`, and set `LUMY_TRUST_PROXY: "1"` so rate limits see the reader's address rather than the proxy's.

## Environment

| Variable | What it does |
|---|---|
| `LUMY_DATA_DIR` | Where accounts, settings and feedback live. Default: `.lumy/` beside the site |
| `LUMY_OUT_DIR` | Where the served site is built. Default: `outDir` from the configuration |
| `LUMY_SECRET` | Encrypts API keys at rest. Set it to keep keys readable when the data folder moves |
| `LUMY_ADMIN_USER`, `LUMY_ADMIN_PASSWORD` | Creates the administrator on first start |
| `LUMY_TRUST_PROXY` | `1` behind a reverse proxy |

The data folder holds plain JSON files: back it up like any folder.
