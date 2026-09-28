/**
 * Which pages are translated, which are missing, which fell behind.
 *
 * A translation records the hash of the source page it was made from, in its
 * front matter (`source_hash`). When the source changes, the hashes stop
 * matching and the page is reported, and shown to readers, as outdated.
 * `lumy translations --stamp fr/getting-started` records that a translation
 * was brought up to date.
 */
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { loadSite, slugFromPath } from './content.js'
import { setFrontmatterField } from './frontmatter.js'
import { readText } from './util.js'

export async function translationReport(config, site) {
  site ??= await loadSite(config)
  const def = config.defaultLanguage
  const report = {}
  for (const { code } of config.languages) {
    if (code === def) continue
    const r = { missing: [], outdated: [], unverified: [], current: [] }
    for (const entry of site.pages.values()) {
      if (!entry.versions[def]) continue
      const page = entry.versions[code]
      if (!page) r.missing.push(entry.slug)
      else r[page.translation]?.push(entry.slug)
    }
    report[code] = r
  }
  return report
}

/**
 * Mark translations as up to date with their source. `target` is "all", a
 * language ("fr") or one page ("fr/getting-started"; "fr/" or "fr/index" for the
 * home page, the name the report gives it).
 */
export async function stampTranslations(config, target) {
  const site = await loadSite(config)
  const def = config.defaultLanguage
  const [lang, ...rest] = String(target).split('/')
  const slug = slugFromPath(rest.join('/'))
  const stamped = []
  for (const entry of site.pages.values()) {
    const source = entry.versions[def]
    if (!source) continue
    for (const [code, page] of Object.entries(entry.versions)) {
      if (code === def) continue
      if (target !== 'all' && code !== lang) continue
      if (target !== 'all' && rest.length && entry.slug !== slug) continue
      if (page.data.source_hash === source.hash) continue
      const file = join(config.docsPath, page.file)
      const text = await readText(file)
      await writeFile(file, setFrontmatterField(text, 'source_hash', source.hash))
      stamped.push(`${code}/${entry.slug}`)
    }
  }
  return stamped
}

export function printReport(report) {
  const langs = Object.keys(report)
  if (!langs.length) {
    console.log('\n  Only one language: nothing to translate.\n')
    return
  }
  for (const lang of langs) {
    const r = report[lang]
    const total = r.missing.length + r.outdated.length + r.unverified.length + r.current.length
    console.log(`\n  ${lang}  ${r.current.length}/${total} up to date`)
    const show = (label, list) => list.length && console.log(`    ${label.padEnd(11)} ${list.map((s) => s || 'index').join(', ')}`)
    show('missing', r.missing)
    show('outdated', r.outdated)
    show('unverified', r.unverified)
  }
  if (langs.some((l) => report[l].unverified.length)) {
    console.log('\n  "unverified" pages have no source_hash yet. Once checked, run:  lumy translations --stamp <lang>/<page>')
  }
  console.log('')
}
