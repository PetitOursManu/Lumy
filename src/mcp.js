/**
 * `lumy mcp`: a Model Context Protocol server over stdio, so an AI assistant
 * (Claude Code, Claude Desktop, any MCP client) can read and write the docs.
 *
 * JSON-RPC 2.0, one message per line, implemented here directly: the protocol
 * surface a tool server needs is small, and Lumy stays dependency-free.
 */
import { createInterface } from 'node:readline'
import { join, dirname, resolve, relative, isAbsolute } from 'node:path'
import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loadConfig, CONFIG_FILE } from './config.js'
import { loadSite } from './content.js'
import { setFrontmatterField } from './frontmatter.js'
import { renderMarkdown } from './markdown.js'
import { stringsFor } from './i18n.js'
import { build, lumyVersion, makeResolvers } from './build.js'
import { translationReport } from './translations.js'
import { AUTHORING_GUIDE } from './guide.js'
import { exists, normalizeEol, pickLang } from './util.js'

const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const TOOLS = [
  {
    name: 'get_guide',
    description: 'How to write pages for this Lumy site: file layout, front matter, and every block (:::tabs, :::steps, :::vars, :::hotspots, :::quiz…). Read it before writing.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_site',
    description: 'Site title, languages (the first is the source language), navigation groups and page count.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_pages',
    description: 'Every page with its slug, title and, for each language, whether a version exists and whether the translation is current.',
    inputSchema: { type: 'object', properties: { lang: { type: 'string', description: 'Only this language.' } } },
  },
  {
    name: 'read_page',
    description: 'The Markdown source of one page, front matter included.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Page slug: "" or "index" for the home page, "guide/setup" for docs/<lang>/guide/setup.md.' }, lang: { type: 'string' } },
      required: ['slug'],
    },
  },
  {
    name: 'write_page',
    description: 'Create or replace a page. Returns the problems found when rendering it (broken links, unknown blocks, undefined glossary terms). A translation (any language but the source) is stamped as current with its source page.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        lang: { type: 'string', description: 'Defaults to the source language.' },
        content: { type: 'string', description: 'Full Markdown, front matter included.' },
      },
      required: ['slug', 'content'],
    },
  },
  {
    name: 'translation_status',
    description: 'Per language: pages missing, outdated (source changed since), unverified (never stamped) and current.',
    inputSchema: { type: 'object', properties: { lang: { type: 'string' } } },
  },
  {
    name: 'search_docs',
    description: 'Search the docs. Returns matching sections with their page slug and heading.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, lang: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    },
  },
  {
    name: 'check_site',
    description: 'Build the site in a temporary folder and report every warning: broken links, missing images, unknown blocks, nav entries without a page.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_nav',
    description: 'Replace the sidebar navigation in lumy.config.json. Each group: { "group": "Label" or { "en": "…", "fr": "…" }, "pages": ["slug", …] }.',
    inputSchema: {
      type: 'object',
      properties: { nav: { type: 'array', items: { type: 'object' } } },
      required: ['nav'],
    },
  },
]

function text(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

function fail(message) {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function cleanSlug(slug) {
  const s = String(slug ?? '').trim().replace(/^\/+|\/+$/g, '').replace(/\.md$/i, '')
  if (s === 'index' || s === 'README') return ''
  if (s.split('/').some((p) => p === '..' || p === '.') || /[\\:*?"<>|]/.test(s)) throw new Error(`Invalid slug "${slug}".`)
  return s
}

export function createTools(rootDir) {
  const load = () => loadConfig(rootDir)

  async function fileFor(config, site, slug, lang) {
    const existing = site.pages.get(slug)?.versions[lang]
    if (existing) return join(config.docsPath, existing.file)
    const prefix = site.langDirs[lang] ?? (config.languages.length > 1 || (await exists(join(config.docsPath, lang))) ? `${lang}/` : '')
    return join(config.docsPath, prefix, `${slug || 'index'}.md`)
  }

  const handlers = {
    async get_guide() {
      return text(AUTHORING_GUIDE)
    },

    async get_site() {
      const config = await load()
      const site = await loadSite(config)
      const def = config.defaultLanguage
      return text({
        title: config.title,
        description: config.description,
        languages: config.languages.map((l) => l.code),
        sourceLanguage: def,
        docsDir: config.docsDir,
        pages: site.pages.size,
        nav: site.nav.map((g) => ({
          group: pickLang(g.label, def, def),
          pages: g.items.map((i) => (i.link ? { link: i.link } : { slug: i.slug || 'index', missing: i.missing || undefined })),
        })),
      })
    },

    async list_pages({ lang } = {}) {
      const config = await load()
      const site = await loadSite(config)
      const langs = lang ? [lang] : config.langCodes
      const pages = [...site.pages.values()].map((entry) => {
        const any = entry.versions[config.defaultLanguage] || Object.values(entry.versions)[0]
        return {
          slug: entry.slug || 'index',
          title: any.title,
          versions: Object.fromEntries(langs.map((l) => [l, entry.versions[l] ? entry.versions[l].translation : 'missing'])),
        }
      })
      return text(pages)
    },

    async read_page({ slug, lang }) {
      const config = await load()
      const site = await loadSite(config)
      const s = cleanSlug(slug)
      const l = lang || config.defaultLanguage
      const page = site.pages.get(s)?.versions[l]
      if (!page) return fail(`No page "${s || 'index'}" in ${l}. Use list_pages to see what exists.`)
      return text(`<!-- file: ${config.docsDir}/${page.file} -->\n${page.raw}`)
    },

    async write_page({ slug, lang, content }) {
      const config = await load()
      const site = await loadSite(config)
      const s = cleanSlug(slug)
      const l = lang || config.defaultLanguage
      if (!config.langCodes.includes(l)) return fail(`"${l}" is not one of this site's languages: ${config.langCodes.join(', ')}.`)
      let body = normalizeEol(String(content ?? ''))
      if (!body.trim()) return fail('Empty content: nothing written.')

      // A translation is written against its source: record which version.
      const source = site.pages.get(s)?.versions[config.defaultLanguage]
      if (l !== config.defaultLanguage && source) body = setFrontmatterField(body, 'source_hash', source.hash)

      const file = await fileFor(config, site, s, l)
      const rel = relative(config.docsPath, file)
      if (rel.startsWith('..') || isAbsolute(rel)) return fail('Refusing to write outside the docs folder.')
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, body.endsWith('\n') ? body : body + '\n')

      // Render it once to report problems while the author can still fix them.
      const fresh = await loadSite(config)
      const page = fresh.pages.get(s)?.versions[l]
      const problems = []
      if (page) {
        const warn = (message) => problems.push(message)
        const { resolveLink, resolveAsset } = makeResolvers(fresh, page, l, warn)
        renderMarkdown(page.body, {
          strings: stringsFor(l, config.ui),
          lang: l,
          glossary: fresh.glossaries[l] || fresh.glossaries[config.defaultLanguage] || new Map(),
          resolveLink,
          resolveAsset,
          warn,
        })
      }
      const inNav = fresh.nav.some((g) => g.items.some((i) => i.slug === s))
      return text({
        written: `${config.docsDir}/${relative(config.docsPath, file).split('\\').join('/')}`,
        problems,
        note: [
          !inNav && Array.isArray(config.nav) && config.nav.length ? 'This page is not in the sidebar yet; add it with set_nav.' : null,
          l === config.defaultLanguage && config.languages.length > 1 ? 'Translations of this page are now outdated until updated (see translation_status).' : null,
        ].filter(Boolean),
      })
    },

    async translation_status({ lang } = {}) {
      const config = await load()
      const report = await translationReport(config)
      return text(lang ? { [lang]: report[lang] ?? 'Not a translation language.' } : report)
    },

    async search_docs({ query, lang, limit = 8 }) {
      const config = await load()
      const site = await loadSite(config)
      const l = lang || config.defaultLanguage
      const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const toks = norm(query).split(/\s+/).filter(Boolean)
      const hits = []
      for (const entry of site.pages.values()) {
        const page = entry.versions[l] || entry.versions[config.defaultLanguage]
        if (!page) continue
        const sections = page.body.split(/^(?=#{2,3} )/m)
        for (const sec of sections) {
          const heading = (sec.match(/^#{2,3} (.+)/) || [])[1] || page.title
          const hay = norm(page.title + ' ' + sec)
          let score = 0
          for (const tk of toks) {
            if (!hay.includes(tk)) {
              score = 0
              break
            }
            score += norm(heading).includes(tk) ? 5 : 1
          }
          if (score) hits.push({ score, slug: entry.slug || 'index', page: page.title, heading: heading.replace(/\s*\{#[\w-]+\}$/, ''), excerpt: sec.replace(/^#{2,3} .+\n/, '').trim().slice(0, 400) })
        }
      }
      hits.sort((a, b) => b.score - a.score)
      return text(hits.slice(0, Math.max(1, Math.min(30, limit))).map(({ score, ...h }) => h))
    },

    async check_site() {
      const config = await load()
      const out = await mkdtemp(join(tmpdir(), 'lumy-check-'))
      try {
        const result = await build(config, { outDir: out, quiet: true })
        return text({ pages: result.pages, warnings: result.warnings })
      } finally {
        await rm(out, { recursive: true, force: true })
      }
    },

    async set_nav({ nav }) {
      if (!Array.isArray(nav)) return fail('"nav" must be an array of groups.')
      for (const g of nav) {
        if (!g || typeof g !== 'object' || !Array.isArray(g.pages)) return fail('Each group needs a "pages" array.')
      }
      const config = await load()
      const file = join(config.root, CONFIG_FILE)
      const raw = JSON.parse(await readFile(file, 'utf8'))
      raw.nav = nav
      await writeFile(file, JSON.stringify(raw, null, 2) + '\n')
      const site = await loadSite(await load())
      const missing = site.nav.flatMap((g) => g.items.filter((i) => i.missing).map((i) => i.slug || 'index'))
      return text({ saved: CONFIG_FILE, missing: missing.length ? missing : undefined })
    },
  }

  return { list: TOOLS, call: (name, args) => (handlers[name] ? handlers[name](args || {}) : Promise.resolve(fail(`Unknown tool "${name}".`))) }
}

export async function runMcp(rootDir) {
  const root = resolve(rootDir || '.')
  await loadConfig(root) // fail fast, on stderr, if there is no site here
  const tools = createTools(root)
  const version = await lumyVersion()
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

  rl.on('line', async (line) => {
    if (!line.trim()) return
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    }
    const { id, method, params } = msg
    const reply = (result) => id !== undefined && send({ jsonrpc: '2.0', id, result })
    const error = (code, message) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message } })
    try {
      switch (method) {
        case 'initialize': {
          const asked = params?.protocolVersion
          return reply({
            protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'lumy', version },
            instructions: 'Tools to read and write this Lumy documentation site. Call get_guide once before writing pages; after writing, act on the problems write_page returns.',
          })
        }
        case 'ping':
          return reply({})
        case 'tools/list':
          return reply({ tools: tools.list })
        case 'tools/call':
          try {
            return reply(await tools.call(params?.name, params?.arguments))
          } catch (err) {
            return reply(fail(err.message))
          }
        default:
          if (method?.startsWith('notifications/')) return
          return error(-32601, `Method not found: ${method}`)
      }
    } catch (err) {
      return error(-32603, err.message)
    }
  })
  rl.on('close', () => process.exit(0))
  process.stderr.write(`lumy mcp: serving ${root}\n`)
}

