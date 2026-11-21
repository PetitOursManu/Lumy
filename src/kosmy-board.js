/**
 * "Sign in with Kosmy Board": Lumy as an OpenID Connect client.
 *
 * Kosmy Board gathers the admin pages of self-hosted apps and signs people in
 * to them. Its button "Open" lands on {site}/auth/kosmy-board/login with `iss`
 * and `target_link_uri` (third-party initiated login), and the dashboard's
 * sign-in page has a button that starts the same flow.
 *
 * Accounts are matched on the Kosmy Board `sub` only, never on the email,
 * which Kosmy Board does not verify. A person links their Kosmy Board account
 * from their own Lumy account (Account → Link); from then on, that `sub` opens
 * that account, with its role. An unknown `sub` opens nothing.
 *
 * node:crypto only: discovery, PKCE, the code exchange and the RS256 check of
 * the ID token are small enough to write here rather than add a dependency.
 */
import { randomBytes, createHash, createPublicKey, verify as verifySignature, timingSafeEqual } from 'node:crypto'

export const LOGIN = 'auth/kosmy-board/login'
export const CALLBACK = 'auth/kosmy-board/callback'
export const LINK = 'auth/kosmy-board/link'
const FLOW_COOKIE = 'lumy_kosmy'
const FLOW_TTL = 10 * 60_000
const MAX_FLOWS = 1000
const DISCOVERY_TTL = 3600_000
const CLOCK_SKEW = 60
// Admin tokens (kosmy.board-admin.v1): 60 seconds of life, 30 seconds of clock tolerance.
const ADMIN_TYP = 'kb-admin+jwt'
const ADMIN_SKEW = 30
const ADMIN_MAX_AGE = 120

/* ── Small pieces ───────────────────────────────────────────────────── */

/** An http(s) address without query, fragment or trailing slash, or null. */
export function normalizeIssuer(value) {
  const v = String(value ?? '').trim().replace(/\/+$/, '')
  if (!v) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (u.search || u.hash || u.username || u.password) return null
    return v
  } catch {
    return null
  }
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

/** PKCE S256: BASE64URL(SHA-256(verifier)). */
export const codeChallenge = (verifier) => createHash('sha256').update(verifier).digest('base64url')

function safeEqual(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Where to land after sign-in: a page of this site only (same origin, under
 * the site's base path), otherwise the dashboard. No open redirects.
 */
export function safeTarget(target, instance, fallback) {
  if (!target) return fallback
  try {
    const home = new URL(instance + '/')
    const u = new URL(target, home)
    if (u.origin !== home.origin) return fallback
    const path = u.pathname + u.search + u.hash
    if (!u.pathname.startsWith(home.pathname) || path.startsWith('//')) return fallback
    return path
  } catch {
    return fallback
  }
}

/** HTTP Basic client authentication (RFC 6749 §2.3.1: form-encoded, then base64). */
export function basicAuth(clientId, clientSecret) {
  const enc = (s) => encodeURIComponent(s).replace(/%20/g, '+')
  return `Basic ${Buffer.from(`${enc(clientId)}:${enc(clientSecret)}`).toString('base64')}`
}

export class OidcError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/* ── Discovery and keys, cached per issuer ──────────────────────────── */

export function createOidcClient({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  const cache = new Map()

  async function getJson(url, init = {}) {
    let res
    try {
      res = await fetchImpl(url, { ...init, headers: { accept: 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(10_000) })
    } catch (err) {
      throw new OidcError('unreachable', `${new URL(url).origin} cannot be reached (${err.cause?.code || err.message})`)
    }
    const body = await res.json().catch(() => ({}))
    return { res, body }
  }

  async function discover(issuer) {
    const hit = cache.get(issuer)
    if (hit && now() - hit.at < DISCOVERY_TTL) return hit.doc
    const { res, body: doc } = await getJson(`${issuer}/.well-known/openid-configuration`)
    if (!res.ok) throw new OidcError('discovery', `discovery failed (HTTP ${res.status})`)
    if (doc.issuer !== issuer) throw new OidcError('discovery', 'discovery: the issuer it announces is not the one configured')
    for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
      if (typeof doc[k] !== 'string') throw new OidcError('discovery', `discovery: missing ${k}`)
    }
    cache.set(issuer, { doc, at: now(), keys: null, keysAt: 0 })
    return doc
  }

  /** The RSA key for `kid`, fetching the key set again once if it is unknown (key rotation). */
  async function signingKey(issuer, kid) {
    const doc = await discover(issuer)
    const entry = cache.get(issuer)
    const find = () => (entry.keys || []).filter((k) => k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256')).find((k, _, all) => (kid ? k.kid === kid : all.length === 1))
    let jwk = find()
    if (!jwk && now() - entry.keysAt > 30_000) {
      const { res, body } = await getJson(doc.jwks_uri)
      if (!res.ok || !Array.isArray(body.keys)) throw new OidcError('token', `jwks: HTTP ${res.status}`)
      entry.keys = body.keys
      entry.keysAt = now()
      jwk = find()
    }
    if (!jwk) throw new OidcError('token', 'token signed with an unknown key')
    return createPublicKey({ key: jwk, format: 'jwk' })
  }

  function authorizationUrl(doc, { clientId, redirectUri, state, nonce, verifier }) {
    const url = new URL(doc.authorization_endpoint)
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: codeChallenge(verifier),
      code_challenge_method: 'S256',
    }).toString()
    return url.href
  }

  /** Code → ID token, with client_secret_basic and the PKCE verifier. */
  async function exchangeCode(doc, { code, redirectUri, verifier, clientId, clientSecret }) {
    const { res, body } = await getJson(doc.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basicAuth(clientId, clientSecret) },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier }).toString(),
    })
    if (!res.ok || typeof body.id_token !== 'string') {
      throw new OidcError('exchange', `the token endpoint refused the code: ${body.error_description || body.error || res.status}`)
    }
    return body.id_token
  }

  /** A JWT signed by the issuer's keys, RS256 only: its header and claims, signature checked. */
  async function verifySigned(jwt, issuer, what) {
    const parts = String(jwt).split('.')
    if (parts.length !== 3) throw new OidcError('token', `${what}: not a JWT`)
    let header, payload
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    } catch {
      throw new OidcError('token', `${what}: unreadable`)
    }
    if (!header || !payload || typeof header !== 'object' || typeof payload !== 'object') throw new OidcError('token', `${what}: unreadable`)
    if (header.alg !== 'RS256') throw new OidcError('token', `${what}: algorithm ${header.alg} refused`)
    const key = await signingKey(issuer, header.kid)
    const ok = verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))
    if (!ok) throw new OidcError('token', `${what}: bad signature`)
    return { header, payload }
  }

  /** The whole ID token check: RS256 signature, iss, aud, exp, nonce. */
  async function verifyIdToken(idToken, { issuer, clientId, nonce }) {
    const { payload } = await verifySigned(idToken, issuer, 'ID token')
    if (payload.iss !== issuer) throw new OidcError('token', 'ID token: wrong issuer')
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!aud.includes(clientId)) throw new OidcError('token', 'ID token: wrong audience')
    if (aud.length > 1 && payload.azp !== clientId) throw new OidcError('token', 'ID token: wrong authorized party')
    const t = Math.floor(now() / 1000)
    if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW < t) throw new OidcError('token', 'ID token: expired')
    if (typeof payload.iat !== 'number' || payload.iat - CLOCK_SKEW > t) throw new OidcError('token', 'ID token: issued in the future')
    if (typeof payload.nonce !== 'string' || !safeEqual(payload.nonce, nonce)) throw new OidcError('token', 'ID token: nonce mismatch')
    if (typeof payload.sub !== 'string' || !payload.sub) throw new OidcError('token', 'ID token: no sub')
    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : '')
    return { sub: payload.sub, name: str(payload.name), email: str(payload.email) || str(payload.preferred_username), locale: str(payload.locale) }
  }

  /**
   * The token Kosmy Board's server sends to the admin API (kosmy.board-admin.v1):
   * signed with the ID tokens' key, but typed `kb-admin+jwt` so that an ID token
   * is never accepted in its place, and made for one request (`htm`, `htu`).
   * `path` is the path that was asked for; `htu` must end with it. The caller
   * keeps the `jti`s it has seen.
   */
  async function verifyAdminToken(jwt, { issuer, clientId, method, path }) {
    const { header, payload } = await verifySigned(jwt, issuer, 'admin token')
    const typ = String(header.typ ?? '').toLowerCase().replace(/^application\//, '')
    if (typ !== ADMIN_TYP) throw new OidcError('token', `admin token: type ${header.typ} refused`)
    if (payload.iss !== issuer) throw new OidcError('token', 'admin token: wrong issuer')
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!aud.includes(clientId)) throw new OidcError('token', 'admin token: wrong audience')
    const t = Math.floor(now() / 1000)
    if (typeof payload.exp !== 'number' || payload.exp + ADMIN_SKEW < t) throw new OidcError('token', 'admin token: expired')
    if (typeof payload.iat !== 'number' || payload.iat - ADMIN_SKEW > t || t - payload.iat > ADMIN_MAX_AGE + ADMIN_SKEW) throw new OidcError('token', 'admin token: too old or issued in the future')
    if (typeof payload.nbf === 'number' && payload.nbf - ADMIN_SKEW > t) throw new OidcError('token', 'admin token: not valid yet')
    if (payload.htm !== method) throw new OidcError('token', 'admin token: made for another method')
    let htu = ''
    try {
      htu = new URL(payload.htu).pathname
    } catch {}
    if (!htu || !htu.endsWith(path)) throw new OidcError('token', 'admin token: made for another address')
    if (typeof payload.jti !== 'string' || !payload.jti) throw new OidcError('token', 'admin token: no jti')
    if (typeof payload.sub !== 'string' || !payload.sub) throw new OidcError('token', 'admin token: no sub')
    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : '')
    return { sub: payload.sub, jti: payload.jti, exp: payload.exp, name: str(payload.name), email: str(payload.email) }
  }

  return { discover, authorizationUrl, exchangeCode, verifyIdToken, verifyAdminToken, forget: (issuer) => cache.delete(issuer) }
}

/* ── The three routes ───────────────────────────────────────────────── */

/**
 * `settings()` gives { issuer, clientId, clientSecret } (secret decrypted) or
 * null when sign-in with Kosmy Board is off. `instance(req)` is this site's
 * address as Kosmy Board knows it, without a trailing slash.
 */
export function createKosmyBoard({ settings, instance, auth, base, cookie, sessionCookie, secure, log = () => {}, client = createOidcClient() }) {
  const flows = new Map()
  const dashboard = () => `${base()}_lumy/admin`

  function keep(flow) {
    const t = Date.now()
    for (const [id, f] of flows) if (f.exp < t) flows.delete(id)
    // Launching is open to anyone: never let it grow without bound.
    while (flows.size >= MAX_FLOWS) flows.delete(flows.keys().next().value)
    const id = randomToken(24)
    flows.set(id, { ...flow, exp: t + FLOW_TTL })
    return id
  }

  const flowCookie = (req, value, maxAge) =>
    `${FLOW_COOKIE}=${value}; Path=${base()}auth/kosmy-board; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`

  function go(res, location, headers = {}) {
    res.writeHead(303, { location, 'cache-control': 'no-store', ...headers }).end()
  }
  /** Problems are shown by the dashboard, in the reader's language. */
  const problem = (res, code, mode = 'login') =>
    go(res, mode === 'link' ? `${dashboard()}?kosmy=${code}#account` : `${base()}_lumy/login?kosmy=${code}`)

  async function start(req, res, { mode, target, user }) {
    const s = await settings()
    if (!s) return problem(res, 'off', mode)
    const doc = await client.discover(s.issuer)
    const state = randomToken(16)
    const nonce = randomToken(16)
    const verifier = randomToken(32)
    const id = keep({ state, nonce, verifier, issuer: s.issuer, clientId: s.clientId, target, mode, uid: user?.id })
    const redirectUri = `${instance(req)}/${CALLBACK}`
    go(res, client.authorizationUrl(doc, { clientId: s.clientId, redirectUri, state, nonce, verifier }), {
      'set-cookie': flowCookie(req, id, FLOW_TTL / 1000),
    })
  }

  async function login(req, res, url) {
    const s = await settings()
    if (!s) return problem(res, 'off')
    const iss = url.searchParams.get('iss')
    if (iss && normalizeIssuer(iss) !== s.issuer) {
      log(`  Kosmy Board: sign-in refused, unknown issuer ${iss}`)
      return problem(res, 'issuer')
    }
    const target = safeTarget(url.searchParams.get('target_link_uri'), instance(req), dashboard())
    return start(req, res, { mode: 'login', target })
  }

  async function link(req, res, user) {
    if (!user) return go(res, `${base()}_lumy/login?next=${encodeURIComponent(dashboard() + '#account')}`)
    return start(req, res, { mode: 'link', target: `${dashboard()}#account`, user })
  }

  async function callback(req, res, url) {
    const id = cookie(req, FLOW_COOKIE)
    const flow = id ? flows.get(id) : null
    // One use only, whatever happens next.
    if (id) flows.delete(id)
    const clear = { 'set-cookie': flowCookie(req, '', 0) }
    const fail = (code, mode = flow?.mode) => {
      res.setHeader('set-cookie', clear['set-cookie'])
      return problem(res, code, mode)
    }
    if (!flow || flow.exp < Date.now() || !safeEqual(flow.state, url.searchParams.get('state') || '')) return fail('expired', 'login')
    const error = url.searchParams.get('error')
    if (error) {
      log(`  Kosmy Board: ${error}${url.searchParams.get('error_description') ? ` (${url.searchParams.get('error_description')})` : ''}`)
      return fail(error === 'access_denied' ? 'denied' : 'failed')
    }
    const s = await settings()
    // The settings changed while the person was away: start again.
    if (!s || s.issuer !== flow.issuer || s.clientId !== flow.clientId) return fail('expired')
    // RFC 9207: the answer comes from the issuer we asked.
    const iss = url.searchParams.get('iss')
    if (iss && iss !== s.issuer) return fail('issuer')

    let claims
    try {
      const doc = await client.discover(s.issuer)
      const idToken = await client.exchangeCode(doc, {
        code: url.searchParams.get('code') || '',
        redirectUri: `${instance(req)}/${CALLBACK}`,
        verifier: flow.verifier,
        clientId: s.clientId,
        clientSecret: s.clientSecret,
      })
      claims = await client.verifyIdToken(idToken, { issuer: s.issuer, clientId: s.clientId, nonce: flow.nonce })
    } catch (err) {
      log(`  Kosmy Board: sign-in failed, ${err.message}`)
      return fail('failed')
    }

    if (flow.mode === 'link') {
      const current = await auth.userFor(cookie(req, 'lumy_session'))
      if (!current || current.id !== flow.uid) return fail('session')
      try {
        await auth.linkKosmy(current.id, claims)
      } catch (err) {
        if (err.code === 'kosmy-taken') return fail('taken')
        throw err
      }
      log(`  Kosmy Board: account "${current.username}" linked`)
      res.setHeader('set-cookie', clear['set-cookie'])
      return go(res, `${dashboard()}?kosmy=linked#account`)
    }

    const user = await auth.findByKosmy(claims.sub)
    if (!user) {
      log(`  Kosmy Board: no Lumy account is linked to ${claims.sub}`)
      return fail('not-linked')
    }
    // A new session replaces the one this browser had, if any.
    await auth.logout(cookie(req, 'lumy_session'))
    const token = await auth.openSession(user.id)
    res.setHeader('set-cookie', [clear['set-cookie'], sessionCookie(req, token)])
    return go(res, flow.target)
  }

  /** Handles `sub` (the path under the site's base) when it is one of ours; returns false otherwise. */
  async function handle(req, res, sub, user) {
    if (sub !== LOGIN && sub !== CALLBACK && sub !== LINK) return false
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET' }).end()
      return true
    }
    const url = new URL(req.url, 'http://x')
    try {
      if (sub === LOGIN) await login(req, res, url)
      else if (sub === LINK) await link(req, res, await user())
      else await callback(req, res, url)
    } catch (err) {
      log(`  Kosmy Board: ${err.message}`)
      if (!res.headersSent) problem(res, err.code === 'discovery' || err.code === 'unreachable' ? 'unreachable' : 'failed', sub === LINK ? 'link' : 'login')
    }
    return true
  }

  return { handle }
}
