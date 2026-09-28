import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadConfig } from '../src/config.js'
import { build } from '../src/build.js'
import { loadSite, parseGlossary, slugFromPath } from '../src/content.js'
import { parseFrontmatter, setFrontmatterField } from '../src/frontmatter.js'
import { translationReport, stampTranslations } from '../src/translations.js'
import { tempSite, SAMPLE } from './helpers.js'

test('front matter: read, and edit one field without touching the rest', () => {
  const src = '---\ntitle: "Hello: world"\naudience: [user, admin]\ntags:\n  - a\n  - b\nempty:\n---\nBody'
  const { data, body } = parseFrontmatter(src)
  assert.deepEqual(data, { title: 'Hello: world', audience: ['user', 'admin'], tags: ['a', 'b'], empty: '' })
  assert.equal(body, 'Body')
  const edited = setFrontmatterField(src, 'source_hash', 'abc123')
  assert.match(edited, /empty:\nsource_hash: abc123\n---\nBody$/)
  assert.equal(setFrontmatterField('Just text', 'x', 1), '---\nx: 1\n---\n\nJust text')
})

test('slugs and glossary parsing', () => {
  assert.equal(slugFromPath('index.md'), '')
  assert.equal(slugFromPath('guide/README.md'), 'guide')
  assert.equal(slugFromPath('guide/setup.md'), 'guide/setup')
  const g = parseGlossary('## Muse {#muse}\n\nThe **design** switch, see [x](y).\n\nMore.\n\n## Design direction\n\nA style.')
  assert.deepEqual([...g.keys()], ['muse', 'design-direction'])
  assert.equal(g.get('muse').def, 'The design switch, see x.')
})

test('a two-language site builds, with fallbacks, links, search and llms.txt', async () => {
  const { root, cleanup } = await tempSite(SAMPLE)
  try {
    const config = await loadConfig(root)
    const result = await build(config, { quiet: true })
    const out = join(root, 'dist')

    // Pages in both languages; install.md exists only in English, so French falls back.
    const frInstall = await readFile(join(out, 'fr/install/index.html'), 'utf8')
    assert.match(frInstall, /<html lang="fr"/)
    assert.match(frInstall, /<article class="lm-doc" lang="en">/)
    assert.match(frInstall, /pas encore traduite/)
    assert.match(frInstall, /Démarrer/) // French group label in the sidebar

    const enHome = await readFile(join(out, 'en/index.html'), 'utf8')
    assert.match(enHome, /href="\/en\/install\/#docker"/)
    assert.match(enHome, /<img src="\/assets\/screen.png" alt="Screen" title="The screen" width="640" height="400"/)
    assert.match(enHome, /<link rel="alternate" hreflang="fr" href="https:\/\/docs.example.com\/fr\/">/)
    assert.match(enHome, /<p class="lm-lead">The home page\.<\/p>/)
    assert.match(enHome, /class="lm-fb"/)

    const enInstall = await readFile(join(out, 'en/install/index.html'), 'utf8')
    assert.match(enInstall, /data-term="muse"/)
    assert.match(enInstall, /"muse":\{"term":"Muse","def":"The design switch\."\}/)
    assert.match(enInstall, /<var class="lm-var" data-var="port">8080<\/var>/)

    // Warnings: the broken link and the nav entry without a page, reported once.
    const messages = result.warnings.map((w) => w.message)
    assert.ok(messages.some((m) => m.includes('Broken link: nowhere.md')))
    assert.equal(messages.filter((m) => m.includes('missing-page')).length, 1)
    assert.equal(messages.filter((m) => m.includes('nowhere.md')).length, 1)

    // Entry point, search, sources, LLM files, sitemap, 404, hashed theme.
    assert.match(await readFile(join(out, 'index.html'), 'utf8'), /location\.replace/)
    const index = JSON.parse(await readFile(join(out, '_lumy/search-en.json'), 'utf8'))
    assert.ok(index.items.some((i) => i.k === 's' && i.h === 'Docker' && i.u === '/en/install/#docker'))
    assert.ok(index.items.some((i) => i.k === 'g' && i.h === 'Muse'))
    assert.match(await readFile(join(out, 'en/install/index.md'), 'utf8'), /^# Install/)
    assert.match(await readFile(join(out, 'llms.txt'), 'utf8'), /- \[Install\]\(https:\/\/docs.example.com\/en\/install\/index.md\)/)
    assert.match(await readFile(join(out, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/docs.example.com\/fr\/install\/<\/loc>/)
    assert.match(await readFile(join(out, '404.html'), 'utf8'), /Page not found/)
    assert.ok((await readdir(join(out, '_lumy'))).some((f) => /^lumy\.[0-9a-f]{8}\.css$/.test(f)))
  } finally {
    await cleanup()
  }
})

test('the output folder is never one Lumy did not create', async () => {
  const { root, cleanup } = await tempSite({ ...SAMPLE, 'dist/precious.txt': 'keep me' })
  try {
    const config = await loadConfig(root)
    await assert.rejects(build(config, { quiet: true }), /not created by Lumy/)
    await assert.rejects(build(config, { quiet: true, outDir: root }), /Refusing/)
    await assert.rejects(build(config, { quiet: true, outDir: join(root, 'docs') }), /Refusing/)
  } finally {
    await cleanup()
  }
})

test('translations: missing, unverified, stamped, then outdated when the source changes', async () => {
  const { root, cleanup } = await tempSite(SAMPLE)
  try {
    const config = await loadConfig(root)
    let report = await translationReport(config)
    assert.deepEqual(report.fr.missing, ['install'])
    assert.deepEqual(report.fr.unverified.sort(), ['', 'glossary'])

    assert.deepEqual((await stampTranslations(config, 'fr/')).sort(), ['fr/'])
    report = await translationReport(config)
    assert.deepEqual(report.fr.current, [''])

    await writeFile(join(root, 'docs/en/index.md'), '# Welcome\n\nChanged.\n')
    report = await translationReport(config)
    assert.deepEqual(report.fr.outdated, [''])

    const site = await loadSite(config)
    assert.equal(site.pages.get('').versions.fr.translation, 'outdated')
    await build(config, { quiet: true })
    assert.match(await readFile(join(root, 'dist/fr/index.html'), 'utf8'), /a changé depuis cette traduction/)
  } finally {
    await cleanup()
  }
})

test('a one-language site may keep its pages straight in docs/', async () => {
  const { root, cleanup } = await tempSite({
    'lumy.config.json': JSON.stringify({ title: 'Solo' }),
    'docs/index.md': '# Solo\n\nSee [setup](guide/setup.md).',
    'docs/guide/setup.md': '# Setup\n\nDone.',
  })
  try {
    const config = await loadConfig(root)
    const result = await build(config, { quiet: true })
    assert.deepEqual(result.warnings, [])
    const home = await readFile(join(root, 'dist/index.html'), 'utf8')
    assert.match(home, /href="\/guide\/setup\/"/)
    assert.match(await readFile(join(root, 'dist/guide/setup/index.html'), 'utf8'), /<h1>Setup<\/h1>/)
  } finally {
    await cleanup()
  }
})
