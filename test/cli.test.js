import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tempSite } from './helpers.js'

const run = promisify(execFile)
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'lumy.js')

test('init makes a site that builds cleanly, in the chosen languages', async () => {
  const { root, cleanup } = await tempSite({})
  try {
    await run(process.execPath, [BIN, 'init', root, '--lang', 'fr,en', '--title', 'Mon appli'])
    const config = JSON.parse(await readFile(join(root, 'lumy.config.json'), 'utf8'))
    assert.equal(config.title, 'Mon appli')
    assert.deepEqual(config.languages, ['fr', 'en'])
    assert.deepEqual((await readdir(join(root, 'docs'))).sort(), ['assets', 'en', 'fr'])
    assert.ok((await readdir(join(root, 'docs', 'fr'))).includes('index.md'))
    assert.ok((await readdir(root)).includes('.gitignore'))

    const { stdout } = await run(process.execPath, [BIN, 'check', '--root', root])
    assert.match(stdout, /No problems found/)
    assert.match(stdout, /en {2}0\/3 up to date/)
    assert.match(stdout, /missing {5}getting-started, glossary, index/)
  } finally {
    await cleanup()
  }
})
