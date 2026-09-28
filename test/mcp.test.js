import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { tempSite, SAMPLE } from './helpers.js'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'lumy.js')

/** Start `lumy mcp` and talk JSON-RPC to it over stdio. */
function client(root) {
  const child = spawn(process.execPath, [BIN, 'mcp', '--root', root], { stdio: ['pipe', 'pipe', 'pipe'] })
  const waiting = new Map()
  let next = 1
  createInterface({ input: child.stdout }).on('line', (line) => {
    const msg = JSON.parse(line)
    waiting.get(msg.id)?.(msg)
    waiting.delete(msg.id)
  })
  return {
    request(method, params) {
      const id = next++
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      return new Promise((ok) => waiting.set(id, ok))
    },
    notify(method) {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n')
    },
    close() {
      child.stdin.end()
      return new Promise((ok) => child.on('exit', ok))
    },
  }
}

const call = async (c, name, args = {}) => {
  const res = await c.request('tools/call', { name, arguments: args })
  return { ...res.result, text: res.result.content[0].text }
}

test('MCP: handshake, tools, and writing a translation', async () => {
  const { root, cleanup } = await tempSite(SAMPLE)
  const c = client(root)
  try {
    const init = await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    assert.equal(init.result.protocolVersion, '2025-06-18')
    assert.equal(init.result.serverInfo.name, 'lumy')
    c.notify('notifications/initialized')

    const list = await c.request('tools/list', {})
    const names = list.result.tools.map((t) => t.name)
    for (const n of ['get_guide', 'list_pages', 'read_page', 'write_page', 'translation_status', 'search_docs', 'check_site', 'set_nav']) assert.ok(names.includes(n), n)

    assert.match((await call(c, 'get_guide')).text, /:::steps/)
    assert.match((await call(c, 'read_page', { slug: 'install' })).text, /# Install/)
    assert.equal((await call(c, 'read_page', { slug: 'install', lang: 'fr' })).isError, true)

    // Writing the French install page stamps it against the English source.
    const written = JSON.parse((await call(c, 'write_page', { slug: 'install', lang: 'fr', content: '# Installer\n\nVoir [l’accueil](index.md) et [rien](rien.md).\n' })).text)
    assert.equal(written.written, 'docs/fr/install.md')
    assert.deepEqual(written.problems, ['Broken link: rien.md'])
    assert.match(await readFile(join(root, 'docs/fr/install.md'), 'utf8'), /^---\nsource_hash: [0-9a-f]{12}\n---\n\n?# Installer/)

    const status = JSON.parse((await call(c, 'translation_status', { lang: 'fr' })).text)
    assert.deepEqual(status.fr.missing, [])
    assert.ok(status.fr.current.includes('install'))

    const found = JSON.parse((await call(c, 'search_docs', { query: 'docker' })).text)
    assert.equal(found[0].slug, 'install')
    assert.equal(found[0].heading, 'Docker')

    assert.equal((await call(c, 'write_page', { slug: '../escape', content: 'x' })).isError, true)

    await call(c, 'set_nav', { nav: [{ group: 'All', pages: ['index', 'install', 'glossary'] }] })
    assert.deepEqual(JSON.parse(await readFile(join(root, 'lumy.config.json'), 'utf8')).nav, [{ group: 'All', pages: ['index', 'install', 'glossary'] }])

    const check = JSON.parse((await call(c, 'check_site')).text)
    assert.ok(check.pages >= 6)

    const unknown = await c.request('nope/nothing', {})
    assert.equal(unknown.error.code, -32601)
  } finally {
    await c.close()
    await cleanup()
  }
})
