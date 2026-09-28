---
title: AI assistants
description: Let Claude, or any MCP client, read and write your documentation. Give readers the whole site as plain text.
audience: [writer, admin]
---

## Writing the docs with an assistant

`lumy mcp` starts an [[MCP]] server for your site. An assistant connected to it can read every page, write new ones in the right place and format, keep translations in step, and check the site for broken links. Before writing, it reads a guide to Lumy's blocks, so its pages use steps, tabs and callouts the way yours do.

Connect your client:

:::tabs group=mcp-client
@tab Claude Code
```bash
claude mcp add lumy -- npx lumy mcp --root /path/to/my-docs
```
@tab Claude Desktop
```json title="claude_desktop_config.json"
{
  "mcpServers": {
    "lumy": {
      "command": "npx",
      "args": ["lumy", "mcp", "--root", "/path/to/my-docs"]
    }
  }
}
```
@tab Other clients
Any client that runs stdio MCP servers works. The command is:
```bash
npx lumy mcp --root /path/to/my-docs
```
:::

Then ask for what you need: "Document the new export button in the interface page, in English and French", "Which French pages are out of date? Update them."

### What the assistant can do

| Tool | What it does |
|---|---|
| `get_guide` | Explains Lumy's file layout, front matter and blocks |
| `get_site` | Title, languages, navigation |
| `list_pages` | Every page, with its status in each language |
| `read_page` | The Markdown of one page |
| `write_page` | Creates or replaces a page and reports problems in it; a translation is stamped as current |
| `translation_status` | Missing, outdated and unverified pages per language |
| `search_docs` | Finds the sections that mention something |
| `check_site` | Builds the site aside and lists every warning |
| `set_nav` | Rewrites the sidebar in lumy.config.json |

:::warning
The server writes files in your docs folder. Review what an assistant wrote before you publish it, as you would for any other author: `git diff` shows every change.
:::

## Reading the docs with an assistant

Every built site also serves its content in forms an assistant reads well:

- **`/llms.txt`**: an index of every page with its description, following the llms.txt convention.
- **`/llms-full.txt`**: the whole documentation in one file, to paste into a conversation.
- **Each page as Markdown**: add `index.md` to a page's address. The **Copy page** button, at the top of every page, copies it for you.

## Answering readers' questions

The assistant panel ("Ask AI") answers readers from your documentation, with links to the pages it used. It needs a server holding the model's key, so it comes with `lumy serve` rather than with the static build; it is off unless you switch it on. Reading the docs never needs an account.
