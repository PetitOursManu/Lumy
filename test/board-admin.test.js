import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateKeyPairSync, createSign, randomUUID } from 'node:crypto'
import { createApp } from '../src/server.js'
import { pickLanguage } from '../src/board-admin.js'
import { tempSite, SAMPLE } from './helpers.js'

const CLIENT_ID = 'lumy-test-client'
const CLIENT_SECRET = 'the client secret'
const SITE = 'https://docs.example.com' // SAMPLE's url: the instance address Kosmy Board knows
const ADMIN = '/api/kosmy-board/admin'

/* ── A fake Kosmy Board: discovery and keys, and the admin tokens its server signs ── */
async function fakeBoard() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }
  let issuer = ''
  const server = createServer((req, res) => {
    const send = (status, value) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
    if (req.url === '/oidc/.well-known/openid-configuration') {
      return send(200, { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` })
    }
    if (req.url === '/oidc/jwks') return send(200, { keys: [jwk] })
    send(404, { error: 'not found' })
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  issuer = `http://127.0.0.1:${server.address().port}/oidc`
  return {
    issuer,
    otherKey: other.privateKey,
    /** A token as Kosmy Board's server makes it for one request; `header`, `claims`, `key` tamper with it. */
    token({ method = 'GET', path = ADMIN, sub = 'board-admin', header = {}, claims = {}, key = privateKey } = {}) {
      const now = Math.floor(Date.now() / 1000)
      const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
      const input = `${enc({ alg: 'RS256', kid: 'k1', typ: 'kb-admin+jwt', ...header })}.${enc({ iss: issuer, aud: CLIENT_ID, sub, iat: now, exp: now + 60, jti: randomUUID(), htm: method, htu: SITE + path, name: 'Ada Board', email: 'ada@example.com', ...claims })}`
      return `${input}.${createSign('RSA-SHA256').update(input).sign(key).toString('base64url')}`
    },
    stop: () => new Promise((ok) => server.close(ok)),
  }
}

/** Lumy with an administrator, an editor, and the Kosmy Board settings. */
async function start(board, files = SAMPLE, base = '') {
  const site = await tempSite(files)
  const app = await createApp(site.root, { log: () => {} })
  const server = createServer(app.handler)
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const origin = `http://127.0.0.1:${server.address().port}`
  let cookie = ''
  async function call(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(origin + path, {
      method,
      redirect: 'manual',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: res.status, json, text, headers: res.headers }
  }
  await call(`${base}/_lumy/api/auth/setup`, { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
  const saved = await call(`${base}/_lumy/api/admin/settings`, { method: 'PUT', body: { kosmyBoard: { issuer: board.issuer, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } } })
  assert.equal(saved.status, 200)
  const admin = (await app.auth.users())[0]
  await app.auth.linkKosmy(admin.id, { sub: 'board-admin', name: 'Ada Board', email: 'ada@example.com' })
  const editor = await app.auth.createUser({ username: 'editor1', password: 'correct horse', role: 'editor' })
  await app.auth.linkKosmy(editor.id, { sub: 'board-editor' })
  cookie = '' // the admin API never uses a session

  /** What Kosmy Board's server does: a fresh token for this exact request. */
  async function board_(path, { method = 'GET', body, lang = 'en', token } = {}) {
    const t = token ?? board.token({ method, path: base + path })
    return call(base + path, { method, body, headers: { authorization: `Bearer ${t}`, 'accept-language': lang } })
  }
  return {
    app,
    call,
    admin: board_,
    root: site.root,
    async stop() {
      await app.close()
      await new Promise((ok) => server.close(ok))
      await site.cleanup()
    },
  }
}

test('Accept-Language picks French or English', () => {
  assert.equal(pickLanguage('fr-FR,fr;q=0.9,en;q=0.8'), 'fr')
  assert.equal(pickLanguage('de-DE,en;q=0.8,fr;q=0.5'), 'en')
  assert.equal(pickLanguage(''), 'en')
  assert.equal(pickLanguage('es'), 'en')
})

test('admin in Kosmy Board: a valid token gets the manifest, in the asked language, as plain JSON', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    const r = await s.admin(ADMIN, { lang: 'fr-FR,fr;q=0.9' })
    assert.equal(r.status, 200)
    assert.equal(r.json.protocol, 'kosmy.board-admin.v1')
    assert.equal(r.json.app.name, 'Lumy')
    assert.match(r.json.app.version, /^\d+\.\d+\.\d+/)
    assert.deepEqual(r.json.user, { name: 'admin', role: 'Administrateur' })
    assert.deepEqual(r.json.sections.map((x) => x.id), ['overview', 'feedback', 'assistant', 'access', 'users', 'mcp', 'account'])
    assert.equal(r.json.sections[0].title, 'Vue d’ensemble')
    assert.match(r.headers.get('content-type'), /^application\/json; charset=utf-8/)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.ok(![...r.headers.keys()].some((h) => h.startsWith('access-control-')), 'no CORS')
    assert.ok(!r.headers.get('set-cookie'), 'no session')

    const en = await s.admin(ADMIN, { lang: 'en-GB,en' })
    assert.equal(en.json.sections[0].title, 'Overview')
    assert.equal(en.json.user.role, 'Administrator')
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('admin in Kosmy Board refuses: ID tokens, wrong key, iss, aud, exp, htm, htu, replays, no settings', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    const refused = async (r, what) => {
      assert.equal(r.status, 401, what)
      assert.equal(r.json.error, 'invalid_token', what)
      assert.equal(typeof r.json.message, 'string', what)
    }
    const now = Math.floor(Date.now() / 1000)
    await refused(await s.call(ADMIN), 'no token')
    await refused(await s.admin(ADMIN, { token: 'not.a.jwt' }), 'garbage')
    // An ID token from the same Board, same key and audience: never accepted here.
    await refused(await s.admin(ADMIN, { token: board.token({ header: { typ: 'JWT' }, claims: { nonce: 'n', htm: undefined, htu: undefined } }) }), 'ID token')
    await refused(await s.admin(ADMIN, { token: board.token({ header: { typ: undefined } }) }), 'no typ')
    await refused(await s.admin(ADMIN, { token: board.token({ header: { typ: 'JWT' } }) }), 'typ JWT, all else right')
    await refused(await s.admin(ADMIN, { token: board.token({ key: board.otherKey }) }), 'wrong key')
    await refused(await s.admin(ADMIN, { token: board.token({ header: { alg: 'HS256' } }) }), 'algorithm switch')
    await refused(await s.admin(ADMIN, { token: board.token({ claims: { aud: 'another-client' } }) }), 'wrong aud')
    await refused(await s.admin(ADMIN, { token: board.token({ claims: { iss: 'https://evil.example/oidc' } }) }), 'wrong iss')
    await refused(await s.admin(ADMIN, { token: board.token({ claims: { iat: now - 200, exp: now - 140 } }) }), 'expired')
    await refused(await s.admin(ADMIN, { token: board.token({ claims: { jti: undefined } }) }), 'no jti')

    // Made for another request: another method, another address.
    await refused(await s.admin(ADMIN, { token: board.token({ method: 'POST' }) }), 'htm')
    await refused(await s.admin(`${ADMIN}/overview`, { token: board.token({ path: `${ADMIN}/users` }) }), 'htu')
    await refused(await s.admin(`${ADMIN}/users`, { method: 'POST', body: { action: 'add' }, token: board.token({ method: 'GET', path: `${ADMIN}/users` }) }), 'GET token for a POST')

    // Within the clock tolerance it still works; and a token serves once.
    const once = board.token({ claims: { exp: now - 20 } })
    assert.equal((await s.admin(ADMIN, { token: once })).status, 200)
    await refused(await s.admin(ADMIN, { token: once }), 'replayed jti')

    // Kosmy Board turned off in Lumy: nothing gets in.
    const off = await s.admin(`${ADMIN}/access`, { method: 'POST', body: { action: 'kosmy-off' } })
    assert.equal(off.status, 200)
    await refused(await s.admin(ADMIN), 'sign-in with Kosmy Board off')
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('admin in Kosmy Board: the sub must be linked, to an administrator', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    const stranger = await s.admin(ADMIN, { token: board.token({ sub: 'nobody' }) })
    assert.equal(stranger.status, 403)
    assert.equal(stranger.json.error, 'not_linked')
    assert.match(stranger.json.message, /linked to no Lumy account/)

    // Linked, but an editor: Kosmy Board gives no rights.
    const editor = await s.admin(ADMIN, { token: board.token({ sub: 'board-editor' }), lang: 'fr' })
    assert.equal(editor.status, 403)
    assert.equal(editor.json.error, 'forbidden')
    assert.match(editor.json.message, /editor1, Rédacteur/)

    // Matched on sub only: the name or email of the admin does not help.
    const lookalike = await s.admin(ADMIN, { token: board.token({ sub: 'someone-else', claims: { email: 'ada@example.com', name: 'Ada Board' } }) })
    assert.equal(lookalike.json.error, 'not_linked')

    // Unknown section; unknown action.
    assert.equal((await s.admin(`${ADMIN}/nope`)).json.error, 'not_found')
    assert.equal((await s.admin(`${ADMIN}/users`, { method: 'POST', body: { action: 'explode' } })).status, 404)
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('admin in Kosmy Board: sections show the dashboard, never a saved secret', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    const users = await s.admin(`${ADMIN}/users`)
    assert.equal(users.status, 200)
    assert.equal(users.json.id, 'users')
    const table = users.json.blocks.find((b) => b.type === 'table')
    assert.deepEqual(table.rows.map((r) => r.cells.username), ['admin (you)', 'editor1'])
    assert.deepEqual(table.rows[0].actions, [], 'no locking yourself out from the Board')
    assert.ok(table.rows[1].actions.includes('make-admin') && !table.rows[1].actions.includes('make-editor'))
    assert.deepEqual(table.rows[1].cells.role, { text: 'Editor' })
    for (const id of table.rows.flatMap((r) => r.actions)) assert.ok(table.rowActions.some((a) => a.id === id), id)

    const overview = await s.admin(`${ADMIN}/overview`)
    const stats = overview.json.blocks.find((b) => b.type === 'stats')
    assert.ok(stats.items.some((i) => i.label === 'Translated into FR'))
    assert.ok(overview.json.blocks.some((b) => b.type === 'actions' && b.items[0].id === 'rebuild'))

    // Secrets: the client secret and the API keys never leave the server.
    const key = await s.admin(`${ADMIN}/assistant`, { method: 'POST', body: { action: 'save-provider:openai', values: { baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini', apiKey: 'sk-very-secret-key' } } })
    assert.equal(key.status, 200)
    assert.deepEqual(key.json.section.blocks.find((b) => b.id === 'providers').rows.find((r) => r.id === 'openai').cells.key, { text: 'Saved', tone: 'success' })
    assert.ok(!(await readFile(join(s.root, '.lumy', 'settings.json'), 'utf8')).includes('sk-very-secret-key'), 'encrypted at rest, as from the dashboard')
    const all = []
    for (const id of ['overview', 'feedback', 'assistant', 'access', 'users', 'mcp', 'account']) {
      const r = await s.admin(`${ADMIN}/${id}`)
      assert.equal(r.status, 200, id)
      assert.ok(r.json.blocks.length >= 1 && r.json.blocks.length <= 30, id)
      all.push(r.text)
    }
    assert.ok(!all.join('').includes(CLIENT_SECRET))
    assert.ok(!all.join('').includes('sk-very-secret-key'))
    assert.ok(!all.join('').includes('board-admin'), 'the Kosmy Board sub stays on the server')
    for (const text of all) {
      for (const b of JSON.parse(text).blocks) {
        for (const f of b.fields || []) if (f.type === 'password') assert.equal(f.value, undefined)
      }
    }
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('admin in Kosmy Board: actions run through the dashboard’s own functions', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    // Add an account: same rules as the dashboard.
    const add = await s.admin(`${ADMIN}/users`, { method: 'POST', body: { action: 'add', values: { username: 'writer', password: 'long enough', role: 'reader' } } })
    assert.equal(add.status, 200)
    assert.equal(add.json.ok, true)
    assert.equal(add.json.message, 'Account writer added.')
    assert.ok(add.json.section.blocks[0].rows.some((r) => r.cells.username === 'writer'), 'the section comes back up to date')
    const writer = (await s.app.auth.users()).find((u) => u.username === 'writer')
    assert.equal(writer.role, 'reader')
    assert.ok((await s.app.auth.login('writer', 'long enough')), 'the password works')

    const short = await s.admin(`${ADMIN}/users`, { method: 'POST', body: { action: 'add', values: { username: 'x2', password: 'short', role: 'reader' } }, lang: 'fr' })
    assert.equal(short.status, 422)
    assert.match(short.json.message, /3 à 40/)
    const taken = await s.admin(`${ADMIN}/users`, { method: 'POST', body: { action: 'add', values: { username: 'WRITER', password: 'long enough', role: 'reader' } } })
    assert.equal(taken.status, 409)
    const badRole = await s.admin(`${ADMIN}/users`, { method: 'POST', body: { action: 'add', values: { username: 'w3', password: 'long enough', role: 'owner' } } })
    assert.equal(badRole.status, 422)

    // Row actions: change a role, refuse your own row, refuse a row that is gone.
    assert.equal((await s.admin(`${ADMIN}/users`, { method: 'POST', body: { action: 'make-editor', row: writer.id } })).status, 200)
    assert.equal((await s.app.auth.users()).find((u) => u.id === writer.id).role, 'editor')
    const me = (await s.app.auth.users()).find((u) => u.username === 'admin')
    assert.equal((await s.admin(`${ADMIN}/users`, { method: 'POST', body: { action: 'make-reader', row: me.id } })).status, 422)
    assert.equal((await s.admin(`${ADMIN}/users`, { method: 'POST', body: { action: 'delete', row: writer.id } })).status, 200)
    assert.ok(!(await s.app.auth.users()).some((u) => u.id === writer.id))
    assert.equal((await s.admin(`${ADMIN}/users`, { method: 'POST', body: { action: 'delete', row: writer.id } })).status, 404)

    // Settings: re-checked against the form, then the dashboard's patch.
    const access = await s.admin(`${ADMIN}/access`, { method: 'POST', body: { action: 'save-access', values: { access: 'private', registration: 'open', defaultRole: 'editor', feedback: false } } })
    assert.equal(access.status, 200)
    assert.equal(s.app.settings.access, 'private')
    assert.equal(s.app.settings.registration, 'open')
    assert.equal(s.app.settings.feedback, false)
    const stored = JSON.parse(await readFile(join(s.root, '.lumy', 'settings.json'), 'utf8'))
    assert.equal(stored.access, 'private')
    assert.equal((await s.admin(`${ADMIN}/access`, { method: 'POST', body: { action: 'save-access', values: { access: 'everyone', registration: 'open', defaultRole: 'editor' } } })).status, 422)
    // The private site does not hide the admin API: Kosmy Board has no session.
    assert.equal((await s.admin(ADMIN)).status, 200)

    // A new MCP token is shown once, through `reveal`, and works.
    const tok = await s.admin(`${ADMIN}/mcp`, { method: 'POST', body: { action: 'create-token', values: { name: 'From the Board', scope: 'read' } } })
    assert.equal(tok.status, 200)
    assert.match(tok.json.reveal.value, /^lumy_/)
    const found = await s.app.tokens.check(tok.json.reveal.value)
    assert.equal(found.scope, 'read')
    assert.equal(found.userId, me.id)
    const row = tok.json.section.blocks.find((b) => b.id === 'tokens').rows[0]
    assert.ok(!JSON.stringify(tok.json.section).includes(tok.json.reveal.value), 'never shown again')
    assert.equal((await s.admin(`${ADMIN}/mcp`, { method: 'POST', body: { action: 'revoke', row: row.id } })).status, 200)
    assert.equal(await s.app.tokens.check(tok.json.reveal.value), null)

    // Bad bodies.
    assert.equal((await s.admin(`${ADMIN}/mcp`, { method: 'POST', body: ['x'] })).status, 400)
    assert.equal((await s.admin(`${ADMIN}/mcp`, { method: 'POST', body: { action: 'save-mcp', values: { enabled: 'yes' } } })).status, 422)
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('admin in Kosmy Board follows the base path', async () => {
  const board = await fakeBoard()
  const config = JSON.parse(SAMPLE['lumy.config.json'])
  const s = await start(board, { ...SAMPLE, 'lumy.config.json': JSON.stringify({ ...config, base: '/docs/', url: SITE }) }, '/docs')
  try {
    const r = await s.admin(ADMIN) // signed for https://docs.example.com/docs/api/kosmy-board/admin
    assert.equal(r.status, 200)
    assert.equal(r.json.protocol, 'kosmy.board-admin.v1')
    const access = await s.admin(`${ADMIN}/access`)
    const kosmy = access.json.blocks.find((b) => b.type === 'fields')
    assert.ok(kosmy.items.some((i) => i.value === `${SITE}/docs/auth/kosmy-board/callback`))
    // Outside the base path, nothing answers.
    const outside = await s.call(ADMIN, { headers: { authorization: `Bearer ${board.token({ path: ADMIN })}` } })
    assert.equal(outside.status, 302)
  } finally {
    await s.stop()
    await board.stop()
  }
})
