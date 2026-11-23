import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateKeyPairSync, createSign, randomUUID } from 'node:crypto'
import { createApp } from '../src/server.js'
import { codeChallenge, basicAuth } from '../src/kosmy-board.js'
import { tempSite, SAMPLE } from './helpers.js'

const CLIENT_ID = 'lumy-test-client'
const CLIENT_SECRET = 'the client secret'
const SITE = 'https://docs.example.com' // SAMPLE's url: the instance address Kosmy Board knows
const USERS = '/api/kosmy-board/users'

/* ── A fake Kosmy Board: discovery, keys, the sign-in's token endpoint, and the admin tokens ── */
async function fakeBoard() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }
  const codes = new Map()
  let issuer = ''
  const sign = (header, claims) => {
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const input = `${enc({ alg: 'RS256', kid: 'k1', ...header })}.${enc(claims)}`
    return `${input}.${createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url')}`
  }
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const c of req) body += c
    const send = (status, value) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
    if (req.url === '/oidc/.well-known/openid-configuration') {
      return send(200, { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` })
    }
    if (req.url === '/oidc/jwks') return send(200, { keys: [jwk] })
    if (req.url === '/oidc/token' && req.method === 'POST') {
      const f = Object.fromEntries(new URLSearchParams(body))
      const grant = codes.get(f.code)
      codes.delete(f.code)
      if (req.headers.authorization !== basicAuth(CLIENT_ID, CLIENT_SECRET) || !grant || codeChallenge(f.code_verifier || '') !== grant.code_challenge) return send(400, { error: 'invalid_grant' })
      const now = Math.floor(Date.now() / 1000)
      return send(200, { id_token: sign({ typ: 'JWT' }, { iss: issuer, aud: CLIENT_ID, sub: grant.sub, exp: now + 300, iat: now, nonce: grant.nonce, ...grant.claims }) })
    }
    send(404, { error: 'not found' })
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  issuer = `http://127.0.0.1:${server.address().port}/oidc`
  return {
    issuer,
    /** The person is signed in to Kosmy Board: a code for this sub, with these ID token claims. */
    authorize(location, sub, claims = {}) {
      const p = Object.fromEntries(new URL(location).searchParams)
      const code = `code-${randomUUID()}`
      codes.set(code, { ...p, sub, claims })
      return { code, state: p.state }
    },
    /** An admin token for one request, as Kosmy Board's server makes it. */
    token({ method = 'GET', path = USERS, sub = 'board-admin', claims = {} } = {}) {
      const now = Math.floor(Date.now() / 1000)
      return sign({ typ: 'kb-admin+jwt' }, { iss: issuer, aud: CLIENT_ID, sub, iat: now, exp: now + 60, jti: randomUUID(), htm: method, htu: SITE + path, ...claims })
    },
    stop: () => new Promise((ok) => server.close(ok)),
  }
}

/** Lumy with an administrator linked to `board-admin`, an editor linked to `board-editor`, and the Kosmy Board settings. */
async function start(board) {
  const site = await tempSite(SAMPLE)
  const app = await createApp(site.root, { log: () => {} })
  const server = createServer(app.handler)
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const origin = `http://127.0.0.1:${server.address().port}`
  async function call(path, { method = 'GET', body, headers = {}, cookie = '' } = {}) {
    const res = await fetch(origin + path, {
      method,
      redirect: 'manual',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    const session = res.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('lumy_session=') && c !== 'lumy_session=')
    return { status: res.status, json, text, headers: res.headers, location: res.headers.get('location'), session, cookies: res.headers.getSetCookie() }
  }
  const setup = await call('/_lumy/api/auth/setup', { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
  const adminCookie = setup.session
  assert.equal((await call('/_lumy/api/admin/settings', { method: 'PUT', body: { kosmyBoard: { issuer: board.issuer, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } }, cookie: adminCookie })).status, 200)
  const admin = (await app.auth.users())[0]
  await app.auth.linkKosmy(admin.id, { sub: 'board-admin', name: 'Ada Board', email: 'ada@example.com' })
  const editor = await app.auth.createUser({ username: 'editor1', password: 'correct horse', role: 'editor' })
  await app.auth.linkKosmy(editor.id, { sub: 'board-editor' })

  /** What Kosmy Board's server does: a fresh token for this exact request. */
  const users = (path = '', { method = 'GET', body, lang = 'en', token, sub } = {}) =>
    call(USERS + path, { method, body, headers: { authorization: `Bearer ${token ?? board.token({ method, path: USERS + path, sub })}`, 'accept-language': lang } })

  /** Sign in with Kosmy Board as `sub`, the ID token carrying `claims`. */
  async function signIn(sub, claims = {}) {
    const started = await call('/auth/kosmy-board/login')
    const flow = started.cookies.find((c) => c.startsWith('lumy_kosmy=')).split(';')[0]
    const { code, state } = board.authorize(started.location, sub, claims)
    return call(`/auth/kosmy-board/callback?code=${code}&state=${state}`, { cookie: flow })
  }

  const find = async (pred) => (await app.auth.users()).find(pred)
  return {
    app,
    call,
    users,
    signIn,
    find,
    adminCookie,
    root: site.root,
    async stop() {
      await app.close()
      await new Promise((ok) => server.close(ok))
      await site.cleanup()
    },
  }
}

test('users in Kosmy Board: GET describes the roles, the restrictions and the linked accounts', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    const r = await s.users('', { lang: 'fr-FR,fr;q=0.9' })
    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type'), /^application\/json; charset=utf-8/)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.ok(![...r.headers.keys()].some((h) => h.startsWith('access-control-')), 'no CORS')
    assert.equal(r.json.protocol, 'kosmy.board-users.v1')
    assert.deepEqual(r.json.roles.map((x) => [x.value, x.label, Boolean(x.admin)]), [['admin', 'Administrateur', true], ['editor', 'Rédacteur', false], ['reader', 'Lecteur', false]])
    for (const role of r.json.roles) assert.ok(role.description.length > 0 && role.description.length <= 200)
    assert.equal(r.json.defaultRole, 'reader', 'the role new accounts get in Lumy')
    assert.deepEqual(r.json.fields.map((f) => ({ name: f.name, type: f.type, value: f.value, roles: f.roles })), [{ name: 'mcpTokens', type: 'checkbox', value: true, roles: ['editor'] }])
    assert.equal(r.json.fields[0].label, 'Peut utiliser des jetons d’accès MCP')
    assert.deepEqual(r.json.users, [
      { sub: 'board-admin', role: 'admin', values: { mcpTokens: true }, active: true, account: 'admin' },
      { sub: 'board-editor', role: 'editor', values: { mcpTokens: true }, active: true, account: 'editor1' },
    ])
    assert.ok(!r.text.includes('scrypt:'), 'no secret')

    // The default role follows Lumy's own setting.
    await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { defaultRole: 'editor' }, cookie: s.adminCookie })
    assert.equal((await s.users('')).json.defaultRole, 'editor')
    assert.equal((await s.users('')).json.roles[0].label, 'Administrator', 'English by default')
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('users in Kosmy Board refuse: no token, wrong htm or htu, replays, unknown or non-admin actors, wrong methods', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    const refused = (r, what) => {
      assert.equal(r.status, 401, what)
      assert.equal(r.json.error, 'invalid_token', what)
      assert.equal(typeof r.json.message, 'string', what)
    }
    refused(await s.call(USERS), 'no token')
    refused(await s.users('', { token: 'not.a.jwt' }), 'garbage')
    refused(await s.users('/new-person', { method: 'PUT', body: { role: 'reader' }, token: board.token({ method: 'GET', path: `${USERS}/new-person` }) }), 'GET token for a PUT')
    refused(await s.users('/new-person', { method: 'DELETE', token: board.token({ method: 'PUT', path: `${USERS}/new-person` }) }), 'PUT token for a DELETE')
    refused(await s.users('/new-person', { method: 'PUT', body: { role: 'reader' }, token: board.token({ method: 'PUT', path: `${USERS}/someone-else` }) }), 'token for another person')
    refused(await s.users('', { token: board.token({ path: '/api/kosmy-board/admin' }) }), 'admin token for the users API')
    refused(await s.call('/api/kosmy-board/admin', { headers: { authorization: `Bearer ${board.token({ path: USERS })}` } }), 'users token for the admin API')
    const once = board.token()
    assert.equal((await s.users('', { token: once })).status, 200)
    refused(await s.users('', { token: once }), 'replayed jti')
    assert.ok(!(await s.find((u) => u.kosmy?.sub === 'new-person')), 'nothing was created')

    const stranger = await s.users('', { sub: 'nobody' })
    assert.equal(stranger.status, 403)
    assert.equal(stranger.json.error, 'not_linked')
    const editor = await s.users('/new-person', { method: 'PUT', body: { role: 'admin' }, sub: 'board-editor', lang: 'fr' })
    assert.equal(editor.status, 403)
    assert.equal(editor.json.error, 'forbidden')
    assert.match(editor.json.message, /editor1, Rédacteur/)
    assert.ok(!(await s.find((u) => u.kosmy?.sub === 'new-person')), 'an editor creates nobody')

    const post = await s.call(USERS, { method: 'POST', body: {}, headers: { authorization: `Bearer ${board.token({ method: 'POST' })}` } })
    assert.equal(post.status, 405)
    assert.equal(post.json.error, 'method_not_allowed')
    assert.equal((await s.users('/x', { method: 'GET' })).status, 405)
    assert.equal((await s.users('/not_a%20sub', { method: 'DELETE' })).status, 404)
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('users in Kosmy Board: PUT creates an account without a password, then updates it, idempotently', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    const body = { name: 'Alice Martin', email: 'alice@exemple.fr', locale: 'fr', role: 'editor', values: { mcpTokens: false } }
    const created = await s.users('/sub-alice', { method: 'PUT', body, lang: 'fr' })
    assert.equal(created.status, 200)
    assert.deepEqual(created.json, { ok: true, status: 'created', account: 'alice', message: 'Compte alice créé. Il se connecte avec Kosmy Board.' })
    const alice = await s.find((u) => u.kosmy?.sub === 'sub-alice')
    assert.equal(alice.username, 'alice')
    assert.equal(alice.role, 'editor')
    assert.equal(alice.password, undefined, 'no password: Kosmy Board only')
    assert.equal(await s.app.auth.login('alice', ''), null)
    assert.deepEqual(alice.limits, { mcpTokens: false })
    assert.deepEqual({ name: alice.kosmy.name, email: alice.kosmy.email }, { name: 'Alice Martin', email: 'alice@exemple.fr' })

    // The same PUT twice: the same account, in the same state.
    const again = await s.users('/sub-alice', { method: 'PUT', body })
    assert.equal(again.json.status, 'updated')
    assert.equal(again.json.message, 'Account alice updated.')
    const same = await s.find((u) => u.kosmy?.sub === 'sub-alice')
    assert.deepEqual({ ...same, kosmy: { ...same.kosmy } }, { ...alice, kosmy: { ...alice.kosmy } })
    assert.equal((await s.app.auth.users()).length, 3)

    // A change of role, restrictions, name and email. A restriction left out keeps its value.
    await s.users('/sub-alice', { method: 'PUT', body: { name: 'Alice M.', email: 'alice.m@exemple.fr', role: 'reader' } })
    const changed = await s.find((u) => u.kosmy?.sub === 'sub-alice')
    assert.equal(changed.role, 'reader')
    assert.deepEqual(changed.limits, { mcpTokens: false })
    assert.deepEqual({ name: changed.kosmy.name, email: changed.kosmy.email }, { name: 'Alice M.', email: 'alice.m@exemple.fr' })
    assert.equal(changed.username, 'alice', 'the username stays')

    // A second person with a username already taken gets another one.
    const other = await s.users('/sub-alice-2', { method: 'PUT', body: { name: 'Alice Two', email: 'Alice@elsewhere.org', role: 'reader' } })
    assert.equal(other.json.account, 'alice-2')

    // GET shows them, with their restrictions.
    const list = (await s.users('')).json.users
    assert.deepEqual(list.find((u) => u.sub === 'sub-alice'), { sub: 'sub-alice', role: 'reader', values: { mcpTokens: false }, active: true, account: 'alice' })
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('users in Kosmy Board: PUT links an unlinked account by its email, refuses one linked to someone else, checks values', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    // An account Kosmy Board created, then unlinked in Lumy: it keeps its email.
    await s.users('/sub-bob', { method: 'PUT', body: { name: 'Bob', email: 'bob@example.com', role: 'editor' } })
    const bob = await s.find((u) => u.kosmy?.sub === 'sub-bob')
    await s.app.auth.unlinkKosmy(bob.id)
    const linked = await s.users('/sub-bob-new', { method: 'PUT', body: { name: 'Bob', email: 'BOB@example.com', role: 'reader' } })
    assert.equal(linked.status, 200)
    assert.equal(linked.json.status, 'linked')
    assert.equal(linked.json.account, 'bob')
    const relinked = await s.find((u) => u.id === bob.id)
    assert.equal(relinked.kosmy.sub, 'sub-bob-new')
    assert.equal(relinked.role, 'reader')

    // The email of an account linked to another Kosmy Board account: 409, nothing created.
    const before = (await s.app.auth.users()).length
    const taken = await s.users('/sub-mallory', { method: 'PUT', body: { name: 'Mallory', email: 'bob@example.com', role: 'reader' }, lang: 'fr' })
    assert.equal(taken.status, 409)
    assert.equal(taken.json.error, 'conflict')
    assert.match(taken.json.message, /déjà relié à un autre compte Kosmy Board/)
    const takenToo = await s.users('/sub-mallory', { method: 'PUT', body: { email: 'ada@example.com', role: 'reader' } })
    assert.equal(takenToo.status, 409, 'the administrator’s own Kosmy Board email')
    assert.equal((await s.app.auth.users()).length, before)

    // Values are checked here: Kosmy Board only passes them on.
    const invalid = async (body, what, status = 422) => {
      const r = await s.users('/sub-carol', { method: 'PUT', body, lang: 'fr' })
      assert.equal(r.status, status, what)
      assert.equal(typeof r.json.message, 'string', what)
      return r
    }
    assert.equal((await invalid({ role: 'owner' }, 'unknown role')).json.message, 'Rôle inconnu.')
    await invalid({}, 'no role')
    assert.match((await invalid({ role: 'editor', values: { mcpTokens: 'yes' } }, 'not a boolean')).json.message, /jetons d’accès MCP/)
    await invalid({ role: 'editor', values: [true] }, 'values not an object')
    await invalid(['x'], 'body not an object', 400)
    assert.equal((await s.call(`${USERS}/sub-carol`, { method: 'PUT', headers: { authorization: `Bearer ${board.token({ method: 'PUT', path: `${USERS}/sub-carol` })}`, 'content-type': 'application/json' }, body: undefined })).status, 400)
    assert.ok(!(await s.find((u) => u.kosmy?.sub === 'sub-carol')))
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('users in Kosmy Board: DELETE disables the account everywhere, PUT enables it again', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    await s.users('/sub-dan', { method: 'PUT', body: { name: 'Dan', email: 'dan@example.com', role: 'editor' } })
    const dan = await s.find((u) => u.kosmy?.sub === 'sub-dan')
    // Dan signs in with Kosmy Board, sets a password from the dashboard, and gets an MCP token.
    const signedIn = await s.signIn('sub-dan')
    assert.equal(signedIn.location, '/_lumy/admin')
    const danCookie = signedIn.session
    assert.equal((await s.call('/_lumy/api/me', { cookie: danCookie })).json.user.username, 'dan')
    await s.app.auth.updateUser(dan.id, { password: 'dan password' })
    const pw = await s.call('/_lumy/api/auth/login', { method: 'POST', body: { username: 'dan', password: 'dan password' } })
    assert.equal(pw.status, 200)
    const danToken = (await s.call('/_lumy/api/admin/tokens', { method: 'POST', body: { name: 'Dan', scope: 'write' }, cookie: pw.session })).json.token.token
    const rpc = (token) => s.call('/_lumy/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ${token}` } })
    assert.equal((await rpc(danToken)).status, 200)
    // Dan is also an administrator, to check the admin in Kosmy Board.
    await s.users('/sub-dan', { method: 'PUT', body: { role: 'admin' } })
    assert.equal((await s.call('/api/kosmy-board/admin', { headers: { authorization: `Bearer ${board.token({ path: '/api/kosmy-board/admin', sub: 'sub-dan' })}` } })).status, 200)

    const off = await s.users('/sub-dan', { method: 'DELETE', lang: 'fr' })
    assert.equal(off.status, 200)
    assert.equal(off.json.ok, true)
    assert.match(off.json.message, /désactivé/)
    const stored = JSON.parse(await readFile(join(s.root, '.lumy', 'users.json'), 'utf8')).find((u) => u.id === dan.id)
    assert.equal(stored.disabled, true, 'its data stays')
    assert.deepEqual((await s.users('')).json.users.find((u) => u.sub === 'sub-dan'), { sub: 'sub-dan', role: 'admin', values: { mcpTokens: true }, active: false, account: 'dan' })

    // Everywhere: open sessions, the password, Kosmy Board sign-in, the admin in Kosmy Board, MCP tokens.
    assert.equal((await s.call('/_lumy/api/me', { cookie: danCookie })).json.user, null)
    assert.equal((await s.call('/_lumy/api/me', { cookie: pw.session })).json.user, null)
    const sessions = JSON.parse(await readFile(join(s.root, '.lumy', 'sessions.json'), 'utf8'))
    assert.ok(!sessions.some((x) => x.userId === dan.id), 'sessions closed')
    const login = await s.call('/_lumy/api/auth/login', { method: 'POST', body: { username: 'dan', password: 'dan password' } })
    assert.equal(login.status, 403)
    assert.equal(login.json.code, 'disabled')
    assert.ok(!login.session)
    assert.equal((await s.call('/_lumy/api/auth/login', { method: 'POST', body: { username: 'dan', password: 'wrong password' } })).status, 401, 'a wrong password says nothing more')
    const board_ = await s.signIn('sub-dan')
    assert.equal(board_.location, '/_lumy/login?kosmy=disabled')
    assert.ok(!board_.session)
    const adminApi = await s.call('/api/kosmy-board/admin', { headers: { authorization: `Bearer ${board.token({ path: '/api/kosmy-board/admin', sub: 'sub-dan' })}` } })
    assert.equal(adminApi.status, 403)
    assert.equal(adminApi.json.error, 'forbidden')
    const usersApi = await s.users('', { sub: 'sub-dan' })
    assert.equal(usersApi.status, 403)
    assert.equal((await rpc(danToken)).status, 401)

    // Nothing to remove: still ok.
    assert.deepEqual((await s.users('/sub-dan', { method: 'DELETE' })).json, { ok: true })
    assert.deepEqual((await s.users('/never-seen', { method: 'DELETE' })).json, { ok: true })

    // A PUT gives the access back: the password, sign-in and the token work again.
    const back = await s.users('/sub-dan', { method: 'PUT', body: { role: 'editor' } })
    assert.equal(back.json.status, 'updated')
    assert.equal((await s.find((u) => u.id === dan.id)).disabled, undefined)
    assert.equal((await s.call('/_lumy/api/auth/login', { method: 'POST', body: { username: 'dan', password: 'dan password' } })).status, 200)
    assert.equal((await s.signIn('sub-dan')).location, '/_lumy/admin')
    assert.equal((await rpc(danToken)).status, 200)
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('users in Kosmy Board: no removing your own rights or access, never zero active administrators', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    const self = await s.users('/board-admin', { method: 'PUT', body: { role: 'editor' }, lang: 'fr' })
    assert.equal(self.status, 409)
    assert.equal(self.json.message, 'Vous ne pouvez pas vous retirer vos propres droits d’administration.')
    const selfOff = await s.users('/board-admin', { method: 'DELETE' })
    assert.equal(selfOff.status, 409)
    assert.equal(selfOff.json.message, 'You cannot remove your own access.')
    const me = await s.find((u) => u.kosmy?.sub === 'board-admin')
    assert.equal(me.role, 'admin')
    assert.ok(!me.disabled)
    // Updating yourself without losing the rights is fine.
    assert.equal((await s.users('/board-admin', { method: 'PUT', body: { role: 'admin', name: 'Ada B.' } })).status, 200)

    // A second administrator, disabled: the first one is now the only active one.
    await s.users('/sub-eve', { method: 'PUT', body: { email: 'eve@example.com', role: 'admin' } })
    await s.users('/sub-eve', { method: 'DELETE' })
    const demote = await s.call(`/_lumy/api/admin/users/${me.id}`, { method: 'PATCH', body: { role: 'editor' }, cookie: s.adminCookie })
    assert.equal(demote.status, 400)
    assert.equal(demote.json.code, 'last-admin')
    assert.equal((await s.call(`/_lumy/api/admin/users/${me.id}`, { method: 'DELETE', body: {}, cookie: s.adminCookie })).json.code, 'last-admin')

    // At sign-in, Kosmy Board's access cannot take the last active administrator's rights away either.
    const refused = await s.signIn('board-admin', { kosmy_board_access: { role: 'reader', values: {} } })
    assert.equal(refused.location, '/_lumy/login?kosmy=access')
    assert.equal((await s.find((u) => u.id === me.id)).role, 'admin')
    // With Eve active again, it can.
    await s.users('/sub-eve', { method: 'PUT', body: { role: 'admin' } })
    assert.ok((await s.signIn('board-admin', { kosmy_board_access: { role: 'reader', values: {} } })).session)
    assert.equal((await s.find((u) => u.id === me.id)).role, 'reader')
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('sign-in with kosmy_board_access: applied like a PUT, the account created if needed, never linked by email', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    // Unknown sub, no claim: nothing opens, as before.
    assert.equal((await s.signIn('sub-frank')).location, '/_lumy/login?kosmy=not-linked')
    assert.equal((await s.app.auth.users()).length, 2)

    // Unknown sub with the claim: the account is created with that role and those restrictions.
    const claims = { name: 'Frank', email: 'frank@example.com', kosmy_board_access: { role: 'editor', values: { mcpTokens: false } } }
    const first = await s.signIn('sub-frank', claims)
    assert.equal(first.location, '/_lumy/admin')
    assert.ok(first.session)
    const frank = await s.find((u) => u.kosmy?.sub === 'sub-frank')
    assert.equal(frank.username, 'frank')
    assert.equal(frank.role, 'editor')
    assert.deepEqual(frank.limits, { mcpTokens: false })
    assert.equal(frank.password, undefined)

    // The restriction is enforced: no new token, and the dashboard says so.
    const me = (await s.call('/_lumy/api/me', { cookie: first.session })).json.user
    assert.deepEqual(me.limits, { mcpTokens: false })
    const token = await s.call('/_lumy/api/admin/tokens', { method: 'POST', body: { name: 'x' }, cookie: first.session })
    assert.equal(token.status, 403)
    assert.equal(token.json.code, 'tokens')

    // A linked account: the claim changes its role and restrictions.
    await s.signIn('sub-frank', { ...claims, kosmy_board_access: { role: 'reader', values: { mcpTokens: true } } })
    const after = await s.find((u) => u.id === frank.id)
    assert.equal(after.role, 'reader')
    assert.deepEqual(after.limits, { mcpTokens: true })
    assert.equal((await s.app.auth.users()).length, 3)

    // An unlinked account with the same email is not taken over at sign-in: a new account is made.
    await s.app.auth.unlinkKosmy(frank.id)
    await s.signIn('sub-frank-2', { ...claims, kosmy_board_access: { role: 'reader' } })
    const other = await s.find((u) => u.kosmy?.sub === 'sub-frank-2')
    assert.notEqual(other.id, frank.id)
    assert.equal(other.username, 'frank-2')

    // A role Lumy does not have: refused, nothing created.
    assert.equal((await s.signIn('sub-gina', { kosmy_board_access: { role: 'owner' } })).location, '/_lumy/login?kosmy=access')
    assert.ok(!(await s.find((u) => u.kosmy?.sub === 'sub-gina')))
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('the editor restriction on MCP tokens stops existing tokens too', async () => {
  const board = await fakeBoard()
  const s = await start(board)
  try {
    const editor = await s.find((u) => u.username === 'editor1')
    const login = await s.call('/_lumy/api/auth/login', { method: 'POST', body: { username: 'editor1', password: 'correct horse' } })
    const value = (await s.call('/_lumy/api/admin/tokens', { method: 'POST', body: { name: 'mine' }, cookie: login.session })).json.token.token
    const rpc = () => s.call('/_lumy/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ${value}` } })
    assert.equal((await rpc()).status, 200)
    await s.users('/board-editor', { method: 'PUT', body: { role: 'editor', values: { mcpTokens: false } } })
    assert.deepEqual((await s.find((u) => u.id === editor.id)).limits, { mcpTokens: false })
    assert.equal((await rpc()).status, 401)
    // Administrators are not concerned: the field is for editors only.
    const adminToken = (await s.call('/_lumy/api/admin/tokens', { method: 'POST', body: { name: 'admin' }, cookie: s.adminCookie })).json.token.token
    assert.match(adminToken, /^lumy_/)
    await s.users('/board-editor', { method: 'PUT', body: { role: 'editor', values: { mcpTokens: true } } })
    assert.equal((await rpc()).status, 200)
  } finally {
    await s.stop()
    await board.stop()
  }
})
