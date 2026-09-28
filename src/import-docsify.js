/**
 * `lumy import docsify <docs> --out <site>`: move a Docsify site to Lumy.
 *
 * Docsify and Lumy disagree on three things, and this is where they are
 * reconciled:
 *
 *   - Languages. Docsify keeps the default language at the root and the others
 *     in sub-folders ("fr/"), or in "page.fr.md" files. Lumy wants one folder
 *     per language, with the same file names in each.
 *   - Links. Docsify resolves Markdown links from the site root ("fr/page.md"
 *     from inside fr/). Lumy, like GitHub, resolves them from the file. Every
 *     link is rewritten; images, which Docsify already resolved from the file,
 *     are too, because the files move.
 *   - Navigation. _sidebar.md becomes "nav" in lumy.config.json.
 */
import { join, posix, dirname } from 'node:path'
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises'
import { walk, exists, slugify, normalizeEol } from './util.js'
import { slugFromPath } from './content.js'
import { LANGUAGE_NAMES } from './i18n.js'

const SIDEBARS = new Set(['_sidebar.md', '_navbar.md', '_coverpage.md'])

/** "**English** · [Français](fr/page.md)": a hand-made language switch, which Lumy draws itself. */
function isLanguageLine(line) {
  const text = line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_]/g, '')
    .trim()
  if (!text || !/[·|/]/.test(text)) return false
  const names = new Set(Object.values(LANGUAGE_NAMES).map((n) => n.toLowerCase()))
  return text.split(/\s*[·|/]\s*/).every((part) => names.has(part.toLowerCase()))
}

/**
 * `> **Why it works this way —** text` → a collapsible :::why block, for the
 * prefixes given with --why. The reasoning stays one click away instead of
 * standing between the reader and the instructions.
 */
function whyBlocks(lines, prefixes) {
  if (!prefixes.length) return lines
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^>\s*\*\*(.+?)\*\*\s*(.*)$/)
    const label = m && m[1].replace(/\s*[—–:-]\s*$/, '').trim()
    if (!m || !prefixes.some((p) => label.toLowerCase() === p.toLowerCase())) {
      out.push(lines[i])
      continue
    }
    const body = [m[2]]
    while (i + 1 < lines.length && /^>/.test(lines[i + 1])) body.push(lines[++i].replace(/^>\s?/, ''))
    out.push(':::why', ...body, ':::')
  }
  return out
}

/**
 * @param {object} options
 * @param {'folders'|'root'} [options.layout] "folders": docs/en/, docs/fr/… "root": the
 *   source language stays at the root of docs/ and the others in their folders,
 *   as Docsify had them, so the files keep their paths.
 */
export async function importDocsify(srcDir, outDir, { langs = ['en'], title = 'Documentation', why = [], layout = 'folders', log = console.log } = {}) {
  const def = langs[0]
  const others = langs.slice(1)
  const files = await walk(srcDir, { skip: (rel, e) => e.name.startsWith('.') || e.name === 'node_modules' })
  const md = files.filter((f) => f.endsWith('.md'))
  const mdSet = new Set(md)

  /** Where each source file goes: { lang, rel } with rel inside docs/<lang>/. */
  const placement = new Map()
  for (const f of md) {
    const base = posix.basename(f)
    if (SIDEBARS.has(base)) continue
    let lang = def
    let rel = f
    const top = f.split('/')[0]
    if (others.includes(top)) {
      lang = top
      rel = f.slice(top.length + 1)
    }
    const suffix = rel.match(/^(.*)\.([a-z]{2}(?:-[A-Z]{2})?)\.md$/)
    if (suffix && langs.includes(suffix[2])) {
      lang = suffix[2]
      rel = suffix[1] + '.md'
    } else if (lang === def) {
      // "X.md" beside "X.<default>.md" holds another language's text.
      const stem = rel.replace(/\.md$/, '')
      if (mdSet.has(`${stem}.${def}.md`)) {
        const owner = others.find((l) => !mdSet.has(`${stem}.${l}.md`) && !mdSet.has(`${l}/${rel}`))
        if (owner) lang = owner
      }
    }
    // Lumy reads README.md as the home page too; "root" keeps every file name.
    if (layout !== 'root') rel = rel.replace(/(^|\/)README\.md$/i, '$1index.md')
    placement.set(f, { lang, rel })
  }

  const targetOf = new Map() // "lang|slug" → new path under docs/
  const newPath = (lang, rel) => (layout === 'root' && lang === def ? rel : `${lang}/${rel}`)
  for (const { lang, rel } of placement.values()) targetOf.set(`${lang}|${slugFromPath(rel)}`, newPath(lang, rel))

  /** A Docsify link target (root-relative) → { lang, slug }. */
  function pageOf(target) {
    let path = target.replace(/^\/+/, '').replace(/^#\//, '')
    let lang = def
    const top = path.split('/')[0]
    if (others.includes(top)) {
      lang = top
      path = path.slice(top.length + 1)
    }
    const suffix = path.match(/^(.*)\.([a-z]{2}(?:-[A-Z]{2})?)\.md$/)
    if (suffix && langs.includes(suffix[2])) {
      lang = suffix[2]
      path = suffix[1] + '.md'
    }
    if (!/\.md$/i.test(path) && path && !path.endsWith('/')) path += '.md'
    const direct = placement.get(target.replace(/^\/+/, ''))
    if (direct) return { lang: direct.lang, slug: slugFromPath(direct.rel) }
    return { lang, slug: slugFromPath(path.replace(/(^|\/)README\.md$/i, '$1index.md')) }
  }

  const relFrom = (fromFile, toFile) => {
    const r = posix.relative(posix.dirname(fromFile), toFile)
    return r || posix.basename(toFile)
  }

  function rewriteTarget(target, srcFile, newFile) {
    if (/^#(?!\/)/.test(target)) return '#' + slugify(decodeURIComponent(target.slice(1)))
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target) || target.startsWith('data:')) return target
    const [pathPart, ...hashParts] = target.split('#')
    const hash = hashParts.length ? '#' + slugify(decodeURIComponent(hashParts.join('#'))) : ''
    // An asset: resolve from the file (Docsify's rule for images), then from the root.
    const fromFile = posix.normalize(posix.join(posix.dirname(srcFile), pathPart))
    const fromRoot = posix.normalize(pathPart.replace(/^\/+/, ''))
    for (const candidate of [fromFile, fromRoot]) {
      if (!candidate.endsWith('.md') && files.includes(candidate)) return relFrom(newFile, candidate) + hash
    }
    // A file outside the docs (source code, say): keep pointing at the same place.
    if (fromFile.startsWith('..')) return relFrom(newFile, fromFile) + hash
    // A page: Docsify resolves from the root; some links were written from the file anyway.
    if (pathPart === '' || pathPart === '/') return hash || target
    for (const candidate of [pathPart, fromFile]) {
      const { lang, slug } = pageOf(candidate)
      const dest = targetOf.get(`${lang}|${slug}`) || targetOf.get(`${def}|${slug}`)
      if (dest) return relFrom(newFile, dest) + hash
    }
    return target
  }

  function convert(text, srcFile, newFile) {
    const lines = normalizeEol(text).split('\n')
    let fence = null
    const out = []
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]
      const t = line.trim()
      if (fence) {
        if (t.startsWith(fence) && /^[`~]+$/.test(t)) fence = null
        out.push(line)
        continue
      }
      const f = t.match(/^(`{3,}|~{3,})/)
      if (f) {
        fence = f[1]
        out.push(line)
        continue
      }
      if (isLanguageLine(line)) {
        // Drop the line, and the blank line after it.
        if (!lines[i + 1]?.trim()) i++
        continue
      }
      // Docsify helpers: "?> tip" and "!> warning" paragraphs.
      const helper = line.match(/^([?!])>\s?(.*)$/)
      if (helper) {
        out.push(helper[1] === '?' ? ':::tip' : ':::warning', helper[2], ':::')
        continue
      }
      // Site widgets written as <div data-xxx-widget="name"></div>.
      const widget = line.match(/^\s*<div\s+data-[\w-]*widget="([\w-]+)"[^>]*>\s*<\/div>\s*$/)
      if (widget) {
        out.push(`:::widget ${widget[1]}`, ':::')
        continue
      }
      line = line.replace(/(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, (_, a, target, b) => a + rewriteTarget(target, srcFile, newFile) + b)
      line = line.replace(/\b(src|href)="([^"]+)"/g, (_, attr, target) => `${attr}="${rewriteTarget(target, srcFile, newFile)}"`)
      out.push(line)
    }
    return whyBlocks(out, why).join('\n')
  }

  const docsOut = join(outDir, 'docs')
  let pages = 0
  for (const [src, { lang, rel }] of placement) {
    const newFile = newPath(lang, rel)
    const text = await readFile(join(srcDir, src), 'utf8')
    await mkdir(dirname(join(docsOut, newFile)), { recursive: true })
    await writeFile(join(docsOut, newFile), convert(text, src, newFile))
    pages++
  }
  let assets = 0
  for (const f of files) {
    if (f.endsWith('.md')) continue
    await mkdir(dirname(join(docsOut, f)), { recursive: true })
    await copyFile(join(srcDir, f), join(docsOut, f))
    assets++
  }

  const nav = await sidebarToNav(srcDir, langs, pageOf)
  const config = {
    title,
    languages: langs,
    nav,
    legacyHashRoutes: true,
  }
  const configFile = join(outDir, 'lumy.config.json')
  if (!(await exists(configFile))) await writeFile(configFile, JSON.stringify(config, null, 2) + '\n')
  log(`\n  Imported ${pages} pages and ${assets} files into ${outDir}\n  Next:  lumy dev --root ${outDir}\n`)
  return { pages, assets, nav }
}

/**
 * _sidebar.md → nav. Top-level links in a row become one group; a top-level
 * line without a link starts a titled group of the links nested under it.
 * Group titles come from each language's own sidebar, matched by position.
 */
async function sidebarToNav(srcDir, langs, pageOf) {
  const read = async (lang, i) => {
    const file = join(srcDir, i === 0 ? '_sidebar.md' : `${lang}/_sidebar.md`)
    return (await exists(file)) ? normalizeEol(await readFile(file, 'utf8')) : null
  }
  const parse = (text) => {
    const groups = []
    let current = null
    for (const line of text.split('\n')) {
      const m = line.match(/^(\s*)[-*]\s+(.*)$/)
      if (!m) continue
      const nested = m[1].length > 0
      const link = m[2].match(/^\[([^\]]+)\]\(([^)\s]+)/)
      if (!nested && !link) {
        current = { label: m[2].trim(), pages: [] }
        groups.push(current)
      } else if (link) {
        if (!nested && (!current || current.label)) {
          current = { label: '', pages: [] }
          groups.push(current)
        }
        current.pages.push(pageOf(link[2]).slug || 'index')
      }
    }
    return groups
  }
  const main = await read(langs[0], 0)
  if (!main) return null
  const groups = parse(main)
  const translated = []
  for (let i = 1; i < langs.length; i++) {
    const text = await read(langs[i], i)
    translated.push(text ? parse(text) : [])
  }
  return groups.map((g, gi) => {
    let group = g.label
    if (g.label && translated.length) {
      group = { [langs[0]]: g.label }
      translated.forEach((t, i) => {
        if (t[gi]?.label) group[langs[i + 1]] = t[gi].label
      })
    }
    return { group, pages: [...new Set(g.pages)] }
  })
}
