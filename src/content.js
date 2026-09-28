/**
 * Reading a site: every page in every language, the navigation, the glossary
 * and the state of each translation.
 *
 * Layout on disk:
 *
 *     docs/
 *       assets/            images and files shared by every language
 *       en/                one folder per language, same file names in each
 *         index.md         the home page
 *         getting-started.md
 *         glossary.md      optional: "## Term {#key}" sections
 *       fr/
 *         index.md
 *         …
 *
 * A single-language site may put its pages straight into docs/.
 */
import { join, posix } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseFrontmatter } from './frontmatter.js'
import { walk, readText, exists, hash, stripTags, slugify, pickLang, toPosix } from './util.js'
import { imageSize } from './image-size.js'

const run = promisify(execFile)
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i

export function sourceHash(body) {
  return hash(body.trim(), 12)
}

/** "guide/index.md" → "guide", "README.md" → "", "a/b.md" → "a/b" */
export function slugFromPath(rel) {
  return rel
    .replace(/\.md$/i, '')
    .replace(/(^|\/)(index|README)$/i, '')
    .replace(/\/$/, '')
}

/** Title from front matter, else the first "# heading", else the file name. */
function titleOf(data, body, slug) {
  if (data.title) return { title: String(data.title), body }
  const m = body.match(/^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/)
  if (m) return { title: stripTags(m[1]).replace(/\s*\{#[\w-]+\}$/, ''), body: body.slice(m[0].length) }
  const last = slug.split('/').pop() || 'Home'
  return { title: last.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), body }
}

export function pageUrl(config, lang, slug) {
  const prefix = config.languages.length > 1 ? `${lang}/` : ''
  return `${config.base}${prefix}${slug ? slug + '/' : ''}`
}

/** Glossary: "## Term {#key}" headings, each followed by its definition. */
export function parseGlossary(body) {
  const entries = new Map()
  const parts = body.split(/^##[ \t]+/m).slice(1)
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const headingLine = (nl === -1 ? part : part.slice(0, nl)).trim()
    const idMatch = headingLine.match(/\{#([\w-]+)\}\s*$/)
    const term = headingLine.replace(/\s*\{#[\w-]+\}\s*$/, '').trim()
    const key = idMatch ? idMatch[1] : slugify(term)
    const rest = nl === -1 ? '' : part.slice(nl + 1)
    const firstPara = rest.trim().split(/\n\s*\n/)[0] || ''
    const def = firstPara
      .replace(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    entries.set(key, { key, term, def })
  }
  return entries
}

async function gitDates(root, docsDir) {
  const dates = new Map()
  try {
    const { stdout } = await run('git', ['-C', root, 'log', '--format=%x00%cI', '--name-only', '--', docsDir], {
      maxBuffer: 64 * 1024 * 1024,
    })
    let current = null
    for (const line of stdout.split('\n')) {
      if (line.startsWith('\0')) current = line.slice(1).trim()
      else if (line.trim() && current) {
        const rel = toPosix(line.trim())
        if (!dates.has(rel)) dates.set(rel, current)
      }
    }
  } catch {
    /* Not a git repository, or git is not installed: no dates, nothing else lost. */
  }
  return dates
}

export async function loadSite(config) {
  const { docsPath, langCodes, defaultLanguage } = config
  const files = await walk(docsPath, { skip: (rel, entry) => entry.name.startsWith('.') || entry.name === 'node_modules' })

  // Where does each language live? "docs/<lang>/" when that folder exists;
  // a one-language site without it reads docs/ directly.
  const langDirs = {}
  for (const code of langCodes) {
    if (await exists(join(docsPath, code))) langDirs[code] = code + '/'
  }
  if (!Object.keys(langDirs).length && langCodes.length === 1) langDirs[langCodes[0]] = ''

  const dates = await gitDates(config.root, toPosix(posix.normalize(config.docsDir)))
  const docsRel = toPosix(posix.normalize(config.docsDir)).replace(/^\.\/?/, '')

  const pages = new Map() // slug → { slug, versions: { lang: page } }
  const glossaries = {}
  for (const [lang, prefix] of Object.entries(langDirs)) {
    for (const rel of files) {
      if (!rel.endsWith('.md') || !rel.startsWith(prefix)) continue
      const inLang = rel.slice(prefix.length)
      // In a one-language site, skip folders named like another language.
      if (!prefix && langCodes.some((c) => inLang.startsWith(c + '/'))) continue
      const raw = await readText(join(docsPath, rel))
      const { data, body: afterFm } = parseFrontmatter(raw)
      if (data.draft === true) continue
      const slug = data.slug ? String(data.slug) : slugFromPath(inLang)
      const { title, body } = titleOf(data, afterFm, slug)
      const page = {
        slug,
        lang,
        file: rel,
        fileInLang: inLang,
        raw,
        data,
        title,
        navTitle: data.navTitle ? String(data.navTitle) : title,
        description: data.description ? String(data.description) : '',
        audience: Array.isArray(data.audience) ? data.audience.map(String) : data.audience ? [String(data.audience)] : [],
        badge: data.badge ? String(data.badge) : '',
        hidden: data.hidden === true,
        order: typeof data.order === 'number' ? data.order : null,
        body,
        hash: sourceHash(afterFm),
        updated: dates.get(`${docsRel ? docsRel + '/' : ''}${rel}`) || null,
      }
      if (!pages.has(slug)) pages.set(slug, { slug, versions: {} })
      pages.get(slug).versions[lang] = page
      if (slug === 'glossary') glossaries[lang] = parseGlossary(body)
    }
  }

  // Translation status, measured against the default language.
  for (const entry of pages.values()) {
    const source = entry.versions[defaultLanguage]
    for (const [lang, page] of Object.entries(entry.versions)) {
      if (lang === defaultLanguage || !source) {
        page.translation = 'source'
        continue
      }
      const stamp = page.data.source_hash ? String(page.data.source_hash) : ''
      page.translation = !stamp ? 'unverified' : stamp === source.hash ? 'current' : 'outdated'
    }
  }

  // Image sizes, read once so the (synchronous) renderer can use them.
  const assets = new Set(files.filter((f) => !f.endsWith('.md')))
  const sizes = new Map()
  await Promise.all(
    [...assets].filter((f) => IMAGE.test(f)).map(async (f) => {
      const size = await imageSize(join(docsPath, f))
      if (size) sizes.set(f, size)
    }),
  )

  const nav = buildNav(config, pages)
  const order = nav.flatMap((g) => g.items.filter((i) => i.slug !== undefined).map((i) => i.slug))

  return { config, pages, glossaries, assets, sizes, nav, order, langDirs }
}

/**
 * The sidebar. From `nav` in the config when present:
 *
 *   "nav": [
 *     { "group": { "en": "Get started", "fr": "Démarrer" }, "pages": ["index", "getting-started"] },
 *     { "group": "Reference", "pages": ["changelog", { "label": "GitHub", "link": "https://…" }] }
 *   ]
 *
 * Otherwise one group per top-level folder, pages sorted by `order` then title.
 */
export function buildNav(config, pages) {
  const def = config.defaultLanguage
  const anyVersion = (slug) => {
    const v = pages.get(slug)?.versions
    return v ? v[def] || Object.values(v)[0] : null
  }
  if (Array.isArray(config.nav) && config.nav.length) {
    return config.nav.map((group, gi) => ({
      id: `g${gi}`,
      label: group.group ?? group.label ?? '',
      items: (group.pages || []).map((item) => {
        if (typeof item === 'string') return { slug: item === 'index' ? '' : item, missing: !pages.has(item === 'index' ? '' : item) }
        if (item.link) return { link: item.link, label: item.label ?? item.link }
        const slug = item.slug === 'index' ? '' : item.slug
        return { slug, label: item.label, missing: !pages.has(slug) }
      }),
    }))
  }
  const groups = new Map()
  for (const entry of pages.values()) {
    const page = anyVersion(entry.slug)
    if (!page || page.hidden || entry.slug === 'glossary') continue
    const folder = entry.slug.includes('/') ? entry.slug.split('/')[0] : ''
    if (!groups.has(folder)) groups.set(folder, [])
    groups.get(folder).push(page)
  }
  const sortPages = (a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.slug === '' ? -1 : b.slug === '' ? 1 : a.title.localeCompare(b.title))
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map(([folder, list], gi) => ({
      id: `g${gi}`,
      label: folder ? folder.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '',
      items: list.sort(sortPages).map((p) => ({ slug: p.slug })),
    }))
}

/** The version of `slug` to show in `lang`: its own, or the default language's as a fallback. */
export function versionFor(site, slug, lang) {
  const entry = site.pages.get(slug)
  if (!entry) return null
  const own = entry.versions[lang]
  if (own) return { page: own, fallback: false }
  const fb = entry.versions[site.config.defaultLanguage] || Object.values(entry.versions)[0]
  return fb ? { page: fb, fallback: true } : null
}

export function groupLabel(site, slug, lang) {
  for (const g of site.nav) if (g.items.some((i) => i.slug === slug)) return pickLang(g.label, lang, site.config.defaultLanguage)
  return ''
}
