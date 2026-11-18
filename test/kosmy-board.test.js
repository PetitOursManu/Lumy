import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateKeyPairSync, createSign, createHash } from 'node:crypto'
import { createApp } from '../src/server.js'
import { safeTarget, normalizeIssuer, codeChallenge, basicAuth } from '../src/kosmy-board.js'
import { tempSite, SAMPLE } from './helpers.js'

const CLIENT_ID = 'lumy-test-client'
const CLIENT_SECRET = 'a secret: with/odd+chars'
const SITE = 'https://docs.example.com' // SAMPLE's url: the instance address Kosmy Board knows

/* ── A fake Kosmy Board: discovery, keys, and a token endpoint that checks everything ── */
async function fakeBoard() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }
  const codes = new Map()
  const seen = []
  let issuer = ''
  const board = {
    tamper: {}, // overrides for the next ID token: { claims, key, kid, alg }
    sign(claims, { key = privateKey, kid = 'k1', alg = 'RS256' } = {}) {
      const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
      const input = `${enc({ alg, kid, typ: 'JWT' })}.${enc(claims)}`
      return `${input}.${createSign('RSA-SHA256').update(input).sign(key).toString('base64url')}`
    },
    otherKey: other.privateKey,
    /** What Kosmy Board does when the person is signed in and the space is linked: hand out a code. */
    authorize(location, sub = 'board-user-1') {
      const u = new URL(location)
      assert.equal(u.origin + u.pathname, `${issuer}/authorize`)
      const p = Object.fromEntries(u.searchParams)
      assert.equal(p.response_type, 'code')
      assert.equal(p.client_id, CLIENT_ID)
      assert.equal(p.scope, 'openid profile email')
      assert.equal(p.code_challenge_method, 'S256')
      assert.ok(p.state.length >= 22 && p.nonce.length >= 22, 'state and nonce carry at least 128 bits')
      const code = `code-${codes.size + 1}`
      codes.set(code, { ...p, sub })
      return { code, state: p.state, redirectUri: p.redirect_uri }
    },
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
      seen.push({ headers: req.headers, form: f })
      if (req.headers.authorization !== basicAuth(CLIENT_ID, CLIENT_SECRET)) return send(401, { error: 'invalid_client' })
      const grant = codes.get(f.code)
      codes.delete(f.code) // one use
      if (!grant || f.grant_type !== 'authorization_code') return send(400, { error: 'invalid_grant' })
      if (f.redirect_uri !== grant.redirect_uri) return send(400, { error: 'invalid_grant', error_description: 'redirect_uri' })
      if (codeChallenge(f.code_verifier || '') !== grant.code_challenge) return send(400, { error: 'invalid_grant', error_description: 'PKCE' })
      const now = Math.floor(Date.now() / 1000)
      const { claims = {}, ...opts } = board.tamper
      board.tamper = {}
      const idToken = board.sign({ iss: issuer, aud: CLIENT_ID, sub: grant.sub, exp: now + 300, iat: now, nonce: grant.nonce, name: 'Ada Board', email: 'ada@example.com', email_verified: false, locale: 'fr', ...claims }, opts)
      return send(200, { access_token: 'at', token_type: 'Bearer', id_token: idToken })
    }
    send(404, { error: 'not found' })
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  issuer = `http://127.0.0.1:${server.address().port}/oidc`
  board.issuer = issuer
  board.seen = seen
  board.stop = () => new Promise((ok) => server.close(ok))
  return board
}

/* ── Lumy, with a browser-like cookie jar ── */
async function start() {
  const site = await tempSite(SAMPLE)
  const app = await createApp(site.root, { log: () => {} })
  const server = createServer(app.handler)
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const jar = new Map()
  async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(base + path.replace(SITE, ''), {
      method,
      redirect: 'manual',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';')
      const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]
      if (!value || /Max-Age=0/.test(line)) jar.delete(name)
      else jar.set(name, value)
    }
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: res.status, json, text, location: res.headers.get('location'), cookies: res.headers.getSetCookie() }
  }
  return {
    call,
    jar,
    root: site.root,
    async stop() {
      await app.close()
      await new Promise((ok) => server.close(ok))
      await site.cleanup()
    },
  }
}

/** Set up an administrator and the Kosmy Board settings. */
async function ready(s, board) {
  await s.call('/_lumy/api/auth/setup', { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
  const r = await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { kosmyBoard: { issuer: board.issuer + '/', clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } } })
  assert.equal(r.status, 200)
  return r.json
}

/** Launch → Kosmy Board → callback. Returns the callback's response. */
async function roundTrip(s, board, launch, { sub, iss = board.issuer } = {}) {
  const started = await s.call(launch)
  assert.equal(started.status, 303)
  const { code, state, redirectUri } = board.authorize(started.location, sub)
  assert.equal(redirectUri, `${SITE}/auth/kosmy-board/callback`)
  return s.call(`/auth/kosmy-board/callback?code=${code}&state=${state}${iss ? `&iss=${encodeURIComponent(iss)}` : ''}`)
}

test('Kosmy Board pieces: PKCE, issuer, Basic credentials, same-origin targets', () => {
  // RFC 7636, appendix B.
  assert.equal(codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  assert.equal(normalizeIssuer(' https://board.example.com/oidc/ '), 'https://board.example.com/oidc')
  assert.equal(normalizeIssuer('ftp://board.example.com'), null)
  assert.equal(normalizeIssuer('https://board.example.com/oidc?x=1'), null)
  assert.equal(basicAuth('a b', 'c:d'), `Basic ${Buffer.from('a+b:c%3Ad').toString('base64')}`)

  const fallback = '/docs/_lumy/admin'
  assert.equal(safeTarget('https://x.example/docs/_lumy/admin#mcp', 'https://x.example/docs', fallback), '/docs/_lumy/admin#mcp')
  assert.equal(safeTarget('/docs/en/install', 'https://x.example/docs', fallback), '/docs/en/install')
  assert.equal(safeTarget('https://evil.example/docs/', 'https://x.example/docs', fallback), fallback)
  assert.equal(safeTarget('//evil.example/docs/', 'https://x.example/docs', fallback), fallback)
  assert.equal(safeTarget('https://x.example/docsevil', 'https://x.example/docs', fallback), fallback)
  assert.equal(safeTarget('https://x.example/other', 'https://x.example/docs', fallback), fallback)
  assert.equal(safeTarget('javascript:alert(1)', 'https://x.example/docs', fallback), fallback)
  assert.equal(safeTarget('', 'https://x.example', '/_lumy/admin'), '/_lumy/admin')
})

test('settings: the client secret is encrypted, never sent back, and the issuer is checked', async () => {
  const board = await fakeBoard()
  const s = await start()
  try {
    assert.equal((await s.call('/_lumy/api/me')).json.kosmyBoard, false)
    const saved = await ready(s, board)
    assert.equal(saved.kosmyBoard.issuer, board.issuer, 'trailing slash dropped')
    assert.equal(saved.kosmyBoard.hasSecret, true)
    assert.equal(saved.kosmyBoard.enabled, true)
    assert.equal(saved.kosmyBoard.redirectUri, `${SITE}/auth/kosmy-board/callback`)
    assert.equal(saved.kosmyBoard.loginUri, `${SITE}/auth/kosmy-board/login`)
    assert.ok(!JSON.stringify(saved).includes(CLIENT_SECRET))
    assert.ok(!(await s.call('/_lumy/api/admin/settings')).text.includes(CLIENT_SECRET))
    assert.ok(!(await readFile(join(s.root, '.lumy', 'settings.json'), 'utf8')).includes(CLIENT_SECRET))
    assert.equal((await s.call('/_lumy/api/me')).json.kosmyBoard, true)

    // An empty secret keeps the saved one; a bad issuer is refused.
    assert.equal((await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { kosmyBoard: { clientSecret: '' } } })).json.kosmyBoard.hasSecret, true)
    const bad = await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { kosmyBoard: { issuer: 'not an address' } } })
    assert.equal(bad.status, 400)
    assert.equal(bad.json.code, 'issuer')

    // Turning it off.
    const off = await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { kosmyBoard: { issuer: '', clientId: '', clientSecret: null } } })
    assert.equal(off.json.kosmyBoard.enabled, false)
    assert.equal(off.json.kosmyBoard.hasSecret, false)
    const launch = await s.call('/auth/kosmy-board/login')
    assert.equal(launch.status, 303)
    assert.equal(launch.location, '/_lumy/login?kosmy=off')
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('sign-in: an unknown sub opens nothing; a linked sub opens its own account', async () => {
  const board = await fakeBoard()
  const s = await start()
  try {
    await ready(s, board)
    // Another administrator who never linked anything, and the first one links.
    await s.call('/_lumy/api/admin/users', { method: 'POST', body: { username: 'editor1', password: 'correct horse', role: 'editor' } })

    // Not linked yet: refused, even though the email may match nothing or anything.
    s.jar.clear()
    const refused = await roundTrip(s, board, `/auth/kosmy-board/login?iss=${encodeURIComponent(board.issuer)}`)
    assert.equal(refused.status, 303)
    assert.equal(refused.location, '/_lumy/login?kosmy=not-linked')
    assert.ok(!s.jar.has('lumy_session'))

    // The administrator links their Kosmy Board account from their own account.
    await s.call('/_lumy/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
    const linked = await roundTrip(s, board, '/auth/kosmy-board/link')
    assert.equal(linked.location, '/_lumy/admin?kosmy=linked#account')
    const me = (await s.call('/_lumy/api/me')).json.user
    assert.deepEqual({ name: me.kosmyBoard.name, email: me.kosmyBoard.email }, { name: 'Ada Board', email: 'ada@example.com' })
    assert.ok(!JSON.stringify(me).includes('board-user-1'), 'the sub stays on the server')
    const users = JSON.parse(await readFile(join(s.root, '.lumy', 'users.json'), 'utf8'))
    assert.equal(users.find((u) => u.username === 'admin').kosmy.sub, 'board-user-1')

    // "Open" from Kosmy Board: third-party initiated login, straight to the target.
    s.jar.clear()
    const opened = await roundTrip(s, board, `/auth/kosmy-board/login?iss=${encodeURIComponent(board.issuer)}&target_link_uri=${encodeURIComponent(`${SITE}/_lumy/admin#mcp`)}`)
    assert.equal(opened.location, '/_lumy/admin#mcp')
    assert.ok(s.jar.has('lumy_session'))
    assert.ok(!s.jar.has('lumy_kosmy'), 'the flow cookie is cleared')
    assert.equal((await s.call('/_lumy/api/me')).json.user.username, 'admin')
    assert.equal((await s.call('/_lumy/api/admin/overview')).status, 200)

    // The token request: client_secret_basic, the PKCE verifier, the exact redirect URI.
    const last = board.seen.at(-1)
    assert.equal(last.headers.authorization, basicAuth(CLIENT_ID, CLIENT_SECRET))
    assert.ok(!last.form.client_secret)
    assert.ok(last.form.code_verifier.length >= 43)

    // The same Kosmy Board account cannot be linked to a second Lumy account.
    s.jar.clear()
    await s.call('/_lumy/api/auth/login', { method: 'POST', body: { username: 'editor1', password: 'correct horse' } })
    const taken = await roundTrip(s, board, '/auth/kosmy-board/link')
    assert.equal(taken.location, '/_lumy/admin?kosmy=taken#account')

    // Unlinking: the sub opens nothing any more.
    s.jar.clear()
    await s.call('/_lumy/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
    assert.equal((await s.call('/_lumy/api/account/kosmy-board', { method: 'DELETE', body: {} })).status, 200)
    s.jar.clear()
    assert.equal((await roundTrip(s, board, '/auth/kosmy-board/login')).location, '/_lumy/login?kosmy=not-linked')
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('sign-in refuses: wrong issuer, foreign targets, replayed or stolen state, bad ID tokens', async () => {
  const board = await fakeBoard()
  const s = await start()
  try {
    await ready(s, board)
    await roundTrip(s, board, '/auth/kosmy-board/link')

    // An issuer other than the configured one, at launch.
    s.jar.clear()
    assert.equal((await s.call('/auth/kosmy-board/login?iss=https%3A%2F%2Fevil.example%2Foidc')).location, '/_lumy/login?kosmy=issuer')

    // A target on another site lands on the dashboard instead.
    const foreign = await roundTrip(s, board, `/auth/kosmy-board/login?target_link_uri=${encodeURIComponent('https://evil.example/steal')}`)
    assert.equal(foreign.location, '/_lumy/admin')

    // A state used twice, or a callback without the browser's flow cookie.
    s.jar.clear()
    const started = await s.call('/auth/kosmy-board/login')
    const { code, state } = board.authorize(started.location)
    const flow = s.jar.get('lumy_kosmy')
    s.jar.delete('lumy_kosmy')
    assert.equal((await s.call(`/auth/kosmy-board/callback?code=${code}&state=${state}`)).location, '/_lumy/login?kosmy=expired')
    s.jar.set('lumy_kosmy', flow)
    assert.equal((await s.call(`/auth/kosmy-board/callback?code=${code}&state=wrong`)).location, '/_lumy/login?kosmy=expired')
    s.jar.set('lumy_kosmy', flow)
    assert.equal((await s.call(`/auth/kosmy-board/callback?code=${code}&state=${state}`)).location, '/_lumy/login?kosmy=expired', 'one use only')

    // RFC 9207: an answer from another issuer.
    s.jar.clear()
    assert.equal((await roundTrip(s, board, '/auth/kosmy-board/login', { iss: 'https://evil.example/oidc' })).location, '/_lumy/login?kosmy=issuer')

    // Kosmy Board said no (the space is not in the person's Board).
    s.jar.clear()
    const st = await s.call('/auth/kosmy-board/login')
    const denied = board.authorize(st.location)
    assert.equal((await s.call(`/auth/kosmy-board/callback?error=access_denied&state=${denied.state}`)).location, '/_lumy/login?kosmy=denied')

    // ID tokens that must not open anything.
    const now = Math.floor(Date.now() / 1000)
    const bad = [
      { key: board.otherKey }, // signed by someone else
      { alg: 'HS256' }, // algorithm switch
      { claims: { nonce: 'replayed-nonce' } },
      { claims: { aud: 'another-client' } },
      { claims: { iss: 'https://evil.example/oidc' } },
      { claims: { exp: now - 3600 } },
    ]
    for (const tamper of bad) {
      s.jar.clear()
      board.tamper = tamper
      const r = await roundTrip(s, board, '/auth/kosmy-board/login')
      assert.equal(r.location, '/_lumy/login?kosmy=failed', JSON.stringify(tamper))
      assert.ok(!s.jar.has('lumy_session'))
    }

    // And the untampered token still works.
    s.jar.clear()
    assert.equal((await roundTrip(s, board, '/auth/kosmy-board/login')).location, '/_lumy/admin')
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('the Kosmy Board routes stay open on a private site, and the link route needs an account', async () => {
  const board = await fakeBoard()
  const s = await start()
  try {
    await ready(s, board)
    await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { access: 'private' } })
    s.jar.clear()
    const launch = await s.call('/auth/kosmy-board/login')
    assert.equal(launch.status, 303)
    assert.ok(launch.location.startsWith(board.issuer + '/authorize?'))
    assert.match(launch.cookies.find((c) => c.startsWith('lumy_kosmy=')), /HttpOnly; SameSite=Lax; Max-Age=600; Secure/)
    assert.match(launch.cookies.find((c) => c.startsWith('lumy_kosmy=')), /Path=\/auth\/kosmy-board/)

    s.jar.clear()
    const link = await s.call('/auth/kosmy-board/link')
    assert.equal(link.location, `/_lumy/login?next=${encodeURIComponent('/_lumy/admin#account')}`)
    assert.equal((await s.call('/auth/kosmy-board/login', { method: 'POST', body: {} })).status, 405)
  } finally {
    await s.stop()
    await board.stop()
  }
})

test('Kosmy Board unreachable: a message, not a crash', async () => {
  const board = await fakeBoard()
  const s = await start()
  try {
    await ready(s, board)
    await board.stop()
    s.jar.clear()
    assert.equal((await s.call('/auth/kosmy-board/login')).location, '/_lumy/login?kosmy=unreachable')
  } finally {
    await s.stop()
  }
})

// Keep the helper honest: the challenge above is the one the fake board checks.
test('codeChallenge is BASE64URL(SHA-256(verifier))', () => {
  assert.equal(codeChallenge('abc'), createHash('sha256').update('abc').digest('base64url'))
})
