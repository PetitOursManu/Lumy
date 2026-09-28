/**
 * `lumy build`: the whole site, written as static files.
 *
 *   dist/
 *     index.html                 sends readers to their language
 *     en/index.html              one folder per page, so URLs end in "/"
 *     en/getting-started/index.html
 *     en/getting-started/index.md   the page source, for "Copy page" and LLMs
 *     assets/…                   copied from docs/
 *     _lumy/lumy.<hash>.css      the theme; the hash changes when the file does
 *     _lumy/search-en.json       the search index, loaded on first search
 *     llms.txt, llms-full.txt, sitemap.xml, 404.html
 *
 * Any static host can serve the result: GitHub Pages, nginx, Dashy…
 */
import { join, dirname, posix, resolve, relative, isAbsolute, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, rm, readdir, mkdir } from 'node:fs/promises'
import { loadSite, pageUrl, versionFor, groupLabel, slugFromPath } from './content.js'
import { renderMarkdown } from './markdown.js'
import { renderPage, renderRedirect } from './render.js'
import { stringsFor } from './i18n.js'
import { esc, hash, stripTags, pickLang, readingMinutes, writeFileSafe, copyFileSafe, exists } from './util.js'

export const LUMY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MARKER = '.lumy-output'

export async function lumyVersion() {
  try {
    return JSON.parse(await readFile(join(LUMY_ROOT, 'package.json'), 'utf8')).version
  } catch {
    return '0.0.0'
  }
}

/**
 * Empty the output folder, but only one Lumy made: a mistyped outDir must
 * never wipe the site's own sources.
 */
async function cleanOutput(out, config) {
  const inside = (child, parent) => {
    const rel = relative(parent, child)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  }
  if (inside(config.root, out) || inside(config.docsPath, out) || inside(out, config.docsPath)) {
    throw new Error(`Refusing to use "${out}" as the output folder: it contains, or is inside, the site's sources.`)
  }
  if (!(await exists(out))) return
  const entries = await readdir(out)
  if (entries.length && !entries.includes(MARKER)) {
    throw new Error(`Refusing to empty "${out}": it was not created by Lumy. Choose another outDir or empty it yourself.`)
  }
  await rm(out, { recursive: true, force: true })
}

export function makeResolvers(site, page, lang, warn) {
  const { config } = site
  const fileDir = posix.dirname(page.file) === '.' ? '' : posix.dirname(page.file)
  const external = (href) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)

  function locate(pathPart) {
    const target = pathPart.startsWith('/') ? pathPart.slice(1) : posix.normalize(posix.join(fileDir, pathPart))
    return target.replace(/^\.\/?$/, '')
  }

  function resolveLink(href) {
    if (!href) return { href: '' }
    if (external(href)) return { href, external: /^(https?:)?\/\//i.test(href) }
    if (href.startsWith('#')) return { href }
    const hashAt = href.indexOf('#')
    const pathPart = hashAt === -1 ? href : href.slice(0, hashAt)
    const hashPart = hashAt === -1 ? '' : href.slice(hashAt)
    const target = locate(pathPart)
    if (target.startsWith('..')) {
      // A link to a file of the repository outside the docs, such as source code.
      if (config.outsideDocsUrl) return { href: new URL(target, config.outsideDocsUrl.replace(/\/?$/, '/')).href + hashPart, external: true }
      warn(`Link leaves the docs folder: ${href} (set "outsideDocsUrl" to send such links to your repository)`)
      return { href, broken: true }
    }
    if (site.assets.has(target)) return { href: config.base + target + hashPart }

    // Which language folder does the target sit in?
    let targetLang = null
    let inLang = target
    for (const [code, prefix] of Object.entries(site.langDirs)) {
      if (prefix && (target + '/').startsWith(prefix)) {
        targetLang = code
        inLang = target.slice(prefix.length)
      }
    }
    const slug = slugFromPath(inLang.replace(/\/$/, ''))
    if (site.pages.has(slug)) {
      // A link into the page's own language follows the language being rendered,
      // so a fallback page links to the reader's language, not the source's.
      const linkLang = !targetLang || targetLang === page.lang ? lang : targetLang
      return { href: pageUrl(config, linkLang, slug) + hashPart }
    }
    warn(`Broken link: ${href}`)
    return { href, broken: true }
  }

  function resolveAsset(src) {
    if (!src) return { url: '' }
    if (external(src) || src.startsWith('data:')) return { url: src }
    const target = locate(src.split(/[?#]/)[0])
    if (!site.assets.has(target)) {
      warn(`Missing file: ${src}`)
      return { url: src, broken: true }
    }
    return { url: config.base + target, size: site.sizes.get(target) }
  }

  return { resolveLink, resolveAsset }
}

/** A link from lumy.config.json ("links"): a page slug, or a full URL. */
function siteHref(site, lang, href) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return href
  const slug = slugFromPath(String(href).replace(/^\/+|\/+$/g, ''))
  return site.pages.has(slug) ? pageUrl(site.config, lang, slug) : href
}

/** Search entries for one rendered page: the page itself, then one per h2/h3 section. */
function sectionsOf(html, page, url) {
  const clean = html
    .replace(/<a class="lm-anchor"[\s\S]*?<\/a>/g, '')
    .replace(/<div class="lm-code-head">[\s\S]*?<\/div>/g, '')
    .replace(/<div class="lm-steps-top">[\s\S]*?<\/div><ol/g, '<ol')
    .replace(/<div class="lm-hs-panel"[\s\S]*?<\/div><\/div><ol/g, '<ol')
    .replace(/<button class="lm-hs-(?:dot|zoom)"[\s\S]*?<\/button>/g, '')
    .replace(/<div class="lm-quiz-fb[\s\S]*?<\/div><\/div>/g, '')
  const parts = clean.split(/(?=<h[23] id=")/)
  const out = []
  const intro = stripTags(parts[0].startsWith('<h') ? '' : parts.shift())
  out.push({ k: 'p', p: page.title, h: '', u: url, t: (page.description ? page.description + ' ' : '') + intro.slice(0, 600) })
  for (const part of parts) {
    const m = part.match(/^<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/)
    if (!m) continue
    out.push({ k: 's', p: page.title, h: stripTags(m[3]), u: `${url}#${m[2]}`, t: stripTags(part.slice(m[0].length)).slice(0, 1500) })
  }
  return out
}

async function copyTheme(out, config) {
  const theme = join(LUMY_ROOT, 'theme')
  const css = await readFile(join(theme, 'lumy.css'), 'utf8')
  const js = await readFile(join(theme, 'lumy.js'), 'utf8')
  const cssName = `lumy.${hash(css, 8)}.css`
  const jsName = `lumy.${hash(js, 8)}.js`
  await writeFileSafe(join(out, '_lumy', cssName), css)
  await writeFileSafe(join(out, '_lumy', jsName), js)
  for (const font of await readdir(join(theme, 'fonts'))) {
    await copyFileSafe(join(theme, 'fonts', font), join(out, '_lumy', 'fonts', font))
  }
  // The site's own scripts and styles, relative to the site root.
  const own = async (list) => {
    const urls = []
    for (const rel of list || []) {
      if (/^https?:\/\//.test(rel)) {
        urls.push(rel)
        continue
      }
      const content = await readFile(resolve(config.root, rel))
      const name = `${basename(rel, extname(rel))}.${hash(content, 8)}${extname(rel)}`
      await writeFileSafe(join(out, '_lumy', 'site', name), content)
      urls.push(`${config.base}_lumy/site/${name}`)
    }
    return urls
  }
  return {
    css: `${config.base}_lumy/${cssName}`,
    js: `${config.base}_lumy/${jsName}`,
    fontSans: `${config.base}_lumy/fonts/Geist-Variable.woff2`,
    scripts: await own(config.scripts),
    styles: await own(config.styles),
  }
}

export async function build(config, { outDir, dev = false, quiet = false } = {}) {
  const started = Date.now()
  const site = await loadSite(config)
  const out = resolve(outDir || config.outPath)
  await cleanOutput(out, config)
  await mkdir(out, { recursive: true })
  await writeFileSafe(join(out, MARKER), 'Built by Lumy. This folder is emptied on every build.\n')

  const warnings = []
  const version = await lumyVersion()
  const buildId = hash([version, JSON.stringify(config.nav), ...[...site.pages.values()].flatMap((e) => Object.values(e.versions).map((p) => p.hash))].join('|'), 8)
  const assets = await copyTheme(out, config)
  for (const rel of site.assets) await copyFileSafe(join(config.docsPath, rel), join(out, rel))
  const assetUrl = (rel) => (!rel ? '' : /^https?:\/\//.test(rel) ? rel : config.base + rel.replace(/^\//, ''))
  assets.logo = assetUrl(config.logo)
  assets.favicon = assetUrl(config.favicon)
  if (config.logo && !/^https?:/.test(config.logo) && !site.assets.has(config.logo.replace(/^\//, ''))) {
    warnings.push({ file: 'lumy.config.json', message: `logo "${config.logo}" is not a file in ${config.docsDir}/` })
  }

  const def = config.defaultLanguage
  const warnedNav = new Set()
  for (const g of site.nav) for (const i of g.items) if (i.missing && !warnedNav.has(i.slug)) {
    warnedNav.add(i.slug)
    warnings.push({ file: 'lumy.config.json', message: `nav lists "${i.slug || 'index'}", which has no page.` })
  }
  let written = 0

  for (const { code: lang } of config.languages) {
    const s = stringsFor(lang, config.ui)
    const glossary = site.glossaries[lang] || site.glossaries[def] || new Map()
    const glossaryPage = site.pages.has('glossary') ? pageUrl(config, lang, 'glossary') : null
    const search = []

    const navFor = (slug) =>
      site.nav.map((g) => ({
        label: pickLang(g.label, lang, def),
        items: g.items
          .filter((i) => !i.missing)
          .map((i) => {
            if (i.link) return { link: true, url: i.link, label: pickLang(i.label, lang, def) }
            const ver = versionFor(site, i.slug, lang)
            return {
              url: pageUrl(config, lang, i.slug),
              label: i.label ? pickLang(i.label, lang, def) : ver.page.navTitle,
              current: i.slug === slug,
              audience: ver.page.audience,
              badge: ver.page.badge,
            }
          }),
      }))

    const titleOf = (slug) => versionFor(site, slug, lang)?.page.title || slug

    for (const slug of site.pages.keys()) {
      const { page, fallback } = versionFor(site, slug, lang)
      const url = pageUrl(config, lang, slug)
      const warn = (message) => {
        // A fallback page repeats its source's problems; report them once.
        if (!fallback) warnings.push({ file: `${config.docsDir}/${page.file}`, message })
      }
      const { resolveLink, resolveAsset } = makeResolvers(site, page, lang, warn)
      const rendered = renderMarkdown(page.body, { strings: s, lang, resolveLink, resolveAsset, glossary, warn })
      const usedTerms = {}
      for (const key of rendered.terms) {
        const g = glossary.get(key)
        if (g) usedTerms[key] = { term: g.term, def: g.def }
      }
      const at = site.order.indexOf(slug)
      const neighbour = (i) => (i >= 0 && i < site.order.length ? { url: pageUrl(config, lang, site.order[i]), title: titleOf(site.order[i]) } : null)
      const html = renderPage({
        config,
        lang,
        s,
        contentLang: page.lang,
        fallback,
        isHome: slug === '',
        page: {
          slug,
          title: page.title,
          description: page.description,
          updated: page.updated,
          translation: fallback ? 'fallback' : page.translation,
          url,
          editUrl: config.editUrl ? config.editUrl.replace('{path}', page.file) : '',
        },
        html: rendered.html,
        headings: rendered.headings,
        nav: navFor(slug),
        prev: at === -1 ? null : neighbour(at - 1),
        next: at === -1 ? null : neighbour(at + 1),
        group: groupLabel(site, slug, lang),
        alternates: config.languages.map((l) => ({ lang: l.code, label: l.label, url: pageUrl(config, l.code, slug) })),
        defaultUrl: pageUrl(config, def, slug),
        homeUrl: pageUrl(config, lang, ''),
        glossary: usedTerms,
        glossaryUrl: glossaryPage,
        assets,
        readingMinutes: readingMinutes(stripTags(rendered.html)),
        searchUrl: `${config.base}_lumy/search-${lang}.json?v=${buildId}`,
        sourceUrl: `${url}index.md`,
        resolveHref: (href) => siteHref(site, lang, href),
        dev,
      })
      await writeFileSafe(join(out, url.slice(config.base.length), 'index.html'), html)
      await writeFileSafe(join(out, url.slice(config.base.length), 'index.md'), `# ${page.title}\n\n${page.body.trim()}\n`)
      written++

      if (slug === 'glossary') {
        for (const g of glossary.values()) search.push({ k: 'g', p: page.title, h: g.term, u: `${url}#${g.key}`, t: g.def })
      } else {
        // Untranslated pages are indexed too, so a reader can still find them.
        search.push(...sectionsOf(rendered.html, page, url))
      }
    }
    if (config.search) await writeFileSafe(join(out, '_lumy', `search-${lang}.json`), JSON.stringify({ v: 1, lang, items: search }))
  }

  // Entry point: the home page itself for one language, a language chooser for several.
  if (config.languages.length > 1) {
    const targets = Object.fromEntries(config.languages.map((l) => [l.code, pageUrl(config, l.code, '')]))
    await writeFileSafe(join(out, 'index.html'), renderRedirect({ config, targets, legacy: config.legacyHashRoutes }))
  }

  await writeNotFound(site, out, assets, dev)
  if (config.llms) await writeLlms(site, out)
  if (config.url) await writeSitemap(site, out)

  const summary = { out, pages: written, warnings, ms: Date.now() - started, site }
  if (!quiet) printSummary(summary)
  return summary
}

async function writeNotFound(site, out, assets, dev) {
  const { config } = site
  const lang = config.defaultLanguage
  const s = stringsFor(lang, config.ui)
  const home = pageUrl(config, lang, '')
  const html = renderPage({
    config,
    lang,
    s,
    contentLang: lang,
    fallback: false,
    isHome: false,
    page: { slug: '404', title: s.notFoundTitle, description: '', updated: null, translation: 'source', url: `${config.base}404.html`, editUrl: '' },
    html: `<p>${esc(s.notFoundText)}</p><p><a class="lm-btn" href="${esc(home)}">${esc(s.backHome)}</a></p>`,
    headings: [],
    nav: site.nav.map((g) => ({
      label: pickLang(g.label, lang, lang),
      items: g.items.filter((i) => !i.missing && !i.link).map((i) => {
        const ver = versionFor(site, i.slug, lang)
        return { url: pageUrl(config, lang, i.slug), label: ver.page.navTitle, current: false, audience: ver.page.audience, badge: ver.page.badge }
      }),
    })),
    prev: null,
    next: null,
    group: '',
    alternates: config.languages.map((l) => ({ lang: l.code, label: l.label, url: pageUrl(config, l.code, '') })),
    defaultUrl: home,
    homeUrl: home,
    glossary: {},
    glossaryUrl: null,
    assets,
    readingMinutes: 1,
    searchUrl: `${config.base}_lumy/search-${lang}.json`,
    sourceUrl: '',
    resolveHref: (href) => siteHref(site, lang, href),
    dev,
  })
  await writeFileSafe(join(out, '404.html'), html)
}

async function writeLlms(site, out) {
  const { config } = site
  const lang = config.defaultLanguage
  const abs = (u) => (config.url ? config.url + u : u)
  const lines = [`# ${config.title}`, '']
  if (config.description) lines.push(`> ${config.description}`, '')
  const full = [`# ${config.title}`, '']
  for (const g of site.nav) {
    const label = pickLang(g.label, lang, lang)
    lines.push(`## ${label || config.title}`, '')
    for (const item of g.items) {
      if (item.missing || item.link) continue
      const { page } = versionFor(site, item.slug, lang)
      const url = pageUrl(config, lang, item.slug)
      lines.push(`- [${page.title}](${abs(url)}index.md)${page.description ? `: ${page.description}` : ''}`)
      full.push(`# ${page.title}`, '', `Source: ${abs(url)}`, '', page.body.trim(), '', '---', '')
    }
    lines.push('')
  }
  if (config.languages.length > 1) {
    lines.push('## Languages', '', ...config.languages.map((l) => `- ${l.label}: ${abs(pageUrl(config, l.code, ''))}`), '')
  }
  await writeFileSafe(join(out, 'llms.txt'), lines.join('\n'))
  await writeFileSafe(join(out, 'llms-full.txt'), full.join('\n'))
}

async function writeSitemap(site, out) {
  const { config } = site
  const urls = []
  for (const slug of site.pages.keys()) {
    for (const { code } of config.languages) {
      const { page } = versionFor(site, slug, code)
      urls.push(`<url><loc>${esc(config.url + pageUrl(config, code, slug))}</loc>${page.updated ? `<lastmod>${page.updated.slice(0, 10)}</lastmod>` : ''}</url>`)
    }
  }
  await writeFileSafe(
    join(out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
  )
}

export function printSummary({ out, pages, warnings, ms }) {
  const rel = relative(process.cwd(), out) || '.'
  console.log(`\n  Lumy  ${pages} pages → ${rel}  (${ms} ms)`)
  if (warnings.length) {
    console.log(`\n  ${warnings.length} warning${warnings.length > 1 ? 's' : ''}:`)
    for (const w of warnings.slice(0, 50)) console.log(`   · ${w.file}: ${w.message}`)
    if (warnings.length > 50) console.log(`   … and ${warnings.length - 50} more (run "lumy check" for the full list)`)
  }
  console.log('')
}
