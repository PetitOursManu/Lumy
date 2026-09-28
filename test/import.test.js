import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { importDocsify } from '../src/import-docsify.js'
import { loadConfig } from '../src/config.js'
import { build } from '../src/build.js'
import { tempSite, PNG } from './helpers.js'

test('a Docsify site becomes a Lumy site that builds without broken links', async () => {
  const src = await tempSite({
    'README.md': '# Home\n\n**English** · [Français](fr/README.md)\n\nSee [setup](guide/setup.md#first-run) and ![logo](assets/logo.png).\n',
    'guide/setup.md': '# Setup\n\n## First run\n\n?> A docsify tip.\n\n> **Why it works this way —** Because.\n> Really.\n\n<div data-app-widget="presets"></div>\n\nBack [home](/).\n',
    'NOTES.md': '# Notes (French)\n\nTexte.\n',
    'NOTES.en.md': '# Notes\n\nText.\n',
    'fr/README.md': '# Accueil\n\nVoir [la mise en place](fr/guide/setup.md#première-utilisation) et ![logo](../assets/logo.png).\n',
    'fr/guide/setup.md': '# Mise en place\n\n## Première utilisation\n\nTexte.\n',
    '_sidebar.md': '- [Home](/)\n- Guide\n  - [Setup](guide/setup.md)\n  - [Notes](NOTES.en.md)\n',
    'fr/_sidebar.md': '- [Accueil](fr/README.md)\n- Le guide\n  - [Mise en place](fr/guide/setup.md)\n  - [Notes](NOTES.md)\n',
    'assets/logo.png': PNG,
  })
  const out = await tempSite({})
  try {
    await importDocsify(src.root, out.root, { langs: ['en', 'fr'], title: 'Imported', why: ['Why it works this way'], log: () => {} })
    const enHome = await readFile(join(out.root, 'docs/en/index.md'), 'utf8')
    assert.doesNotMatch(enHome, /Français/)
    assert.match(enHome, /\[setup\]\(guide\/setup\.md#first-run\)/)
    assert.match(enHome, /!\[logo\]\(\.\.\/assets\/logo\.png\)/)

    const frHome = await readFile(join(out.root, 'docs/fr/index.md'), 'utf8')
    assert.match(frHome, /\(guide\/setup\.md#premiere-utilisation\)/)
    assert.match(frHome, /\(\.\.\/assets\/logo\.png\)/)

    const setup = await readFile(join(out.root, 'docs/en/guide/setup.md'), 'utf8')
    assert.match(setup, /:::tip\nA docsify tip\.\n:::/)
    assert.match(setup, /:::why\nBecause\.\nReally\.\n:::/)
    assert.match(setup, /:::widget presets\n:::/)

    // "NOTES.md" beside "NOTES.en.md" is the French version.
    assert.match(await readFile(join(out.root, 'docs/fr/NOTES.md'), 'utf8'), /French/)
    assert.match(await readFile(join(out.root, 'docs/en/NOTES.md'), 'utf8'), /# Notes\n/)

    const config = JSON.parse(await readFile(join(out.root, 'lumy.config.json'), 'utf8'))
    assert.deepEqual(config.nav, [
      { group: '', pages: ['index'] },
      { group: { en: 'Guide', fr: 'Le guide' }, pages: ['guide/setup', 'NOTES'] },
    ])

    const result = await build(await loadConfig(out.root), { quiet: true })
    assert.deepEqual(result.warnings.filter((w) => !w.message.includes('Unknown block')), [])
  } finally {
    await src.cleanup()
    await out.cleanup()
  }
})

test('import with layout "root" keeps the source language where Docsify had it', async () => {
  const src = await tempSite({
    'README.md': '# Home\n\nSee [setup](guide/setup.md).\n',
    'guide/setup.md': '# Setup\n\nBack to [home](/) and [notes](guide/notes.md).\n',
    'guide/notes.md': '# Notes\n',
    'fr/README.md': '# Accueil\n\nVoir [la mise en place](fr/guide/setup.md).\n',
    'fr/guide/setup.md': '# Mise en place\n',
  })
  const out = await tempSite({})
  try {
    await importDocsify(src.root, out.root, { langs: ['en', 'fr'], layout: 'root', log: () => {} })
    assert.match(await readFile(join(out.root, 'docs/README.md'), 'utf8'), /\[setup\]\(guide\/setup\.md\)/)
    // A root-relative Docsify link inside a sub-folder becomes relative to the file.
    assert.match(await readFile(join(out.root, 'docs/guide/setup.md'), 'utf8'), /\[notes\]\(notes\.md\)/)
    assert.match(await readFile(join(out.root, 'docs/fr/README.md'), 'utf8'), /\(guide\/setup\.md\)/)
    const result = await build(await loadConfig(out.root), { quiet: true })
    assert.deepEqual(result.warnings, [])
  } finally {
    await src.cleanup()
    await out.cleanup()
  }
})
