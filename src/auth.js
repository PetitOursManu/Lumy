/**
 * Accounts for `lumy serve`.
 *
 * Reading public documentation never needs an account. Accounts exist for the
 * people who run the site (admin), who look after its content (editor), and,
 * when the admin makes the documentation private, for its readers (reader).
 * The first account created is the administrator; after that, sign-ups are
 * closed unless the administrator opens them.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

export const ROLES = ['admin', 'editor', 'reader']
const SESSION_DAYS = 30
const MIN_PASSWORD = 8

const sha = (t) => createHash('sha256').update(t).digest('hex')

export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(String(password), salt, 64)
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`
}

export function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split(':')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(expected, actual)
}

export function validateCredentials(username, password) {
  const u = String(username ?? '').trim()
  if (!/^[\p{L}\p{N}._-]{3,40}$/u.test(u)) return 'username'
  if (String(password ?? '').length < MIN_PASSWORD) return 'password'
  return null
}

/**
 * Per-account restrictions. Kosmy Board sets them (kosmy.board-users.v1);
 * each one is enforced where it applies, never only shown.
 *   mcpTokens (editors): may create MCP access tokens, and their tokens work.
 */
export const LIMITS = [{ name: 'mcpTokens', type: 'checkbox', value: true, roles: ['editor'] }]

/** The restrictions of an account, defaults filled in. */
export const limitsOf = (u) => Object.fromEntries(LIMITS.map((f) => [f.name, u?.limits?.[f.name] ?? f.value]))

/** Whether this account may hold MCP access tokens that work. */
export const mayUseTokens = (u) => Boolean(u) && !u.disabled && (u.role !== 'editor' || limitsOf(u).mcpTokens)

/** Administrators who can still sign in: the site never runs out of them. */
const activeAdmins = (list) => list.filter((u) => u.role === 'admin' && !u.disabled)

const fail = (code, extra = {}) => {
  throw Object.assign(new Error(code), { code, ...extra })
}

const sameEmail = (a, b) => Boolean(a && b) && String(a).toLowerCase() === String(b).toLowerCase()

/** A free username made from the email or the name: same rules as a typed one. */
function freeUsername(list, { email, name }) {
  const clean = (s) => String(s || '').normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[._-]+|[._-]+$/g, '').slice(0, 32)
  let stem = clean(email && email.split('@')[0].toLowerCase()) || clean(name)
  if (stem.length < 3) stem = 'user'
  const taken = new Set(list.map((u) => u.username.toLowerCase()))
  if (!taken.has(stem.toLowerCase())) return stem
  for (let i = 2; ; i++) if (!taken.has(`${stem}-${i}`.toLowerCase())) return `${stem}-${i}`
}

/** Public view of an account: never the password hash, never the Kosmy Board `sub`. */
export const publicUser = (u) =>
  u
    ? {
        id: u.id,
        username: u.username,
        role: u.role,
        createdAt: u.createdAt,
        disabled: Boolean(u.disabled),
        limits: limitsOf(u),
        kosmyBoard: u.kosmy ? { name: u.kosmy.name, email: u.kosmy.email, linkedAt: u.kosmy.linkedAt } : null,
      }
    : null

export function createAuth(store) {
  const USERS = 'users.json'
  const SESSIONS = 'sessions.json'

  async function users() {
    return store.read(USERS, [])
  }

  async function createUser({ username, password, role = 'reader' }) {
    const problem = validateCredentials(username, password)
    if (problem) throw Object.assign(new Error(problem), { code: problem })
    return store.update(USERS, [], (list) => {
      const name = String(username).trim()
      if (list.some((u) => u.username.toLowerCase() === name.toLowerCase())) throw Object.assign(new Error('taken'), { code: 'taken' })
      // The very first account runs the site, whatever was asked.
      const user = { id: randomBytes(8).toString('hex'), username: name, role: list.length ? (ROLES.includes(role) ? role : 'reader') : 'admin', password: hashPassword(password), createdAt: new Date().toISOString() }
      return { value: [...list, user], returns: user }
    })
  }

  async function login(username, password) {
    const name = String(username ?? '').trim().toLowerCase()
    const user = (await users()).find((u) => u.username.toLowerCase() === name)
    // Hash anyway when the user does not exist, so timing does not tell.
    const ok = user ? verifyPassword(password, user.password) : (verifyPassword(password, hashPassword('x')), false)
    if (!ok) return null
    // Access removed (by Kosmy Board): the right password opens nothing.
    if (user.disabled) return { user, disabled: true }
    return { user, token: await openSession(user.id) }
  }

  async function checkPassword(id, password) {
    const user = (await users()).find((u) => u.id === id)
    return Boolean(user && verifyPassword(password, user.password))
  }

  async function openSession(userId) {
    const token = randomBytes(32).toString('base64url')
    const expires = Date.now() + SESSION_DAYS * 86400_000
    await store.update(SESSIONS, [], (list) => ({
      value: [...list.filter((s) => s.expires > Date.now()), { id: sha(token), userId, expires }],
    }))
    return token
  }

  async function userFor(token) {
    if (!token) return null
    const id = sha(token)
    const session = (await store.read(SESSIONS, [])).find((s) => s.id === id && s.expires > Date.now())
    if (!session) return null
    const found = (await users()).find((u) => u.id === session.userId)
    // A disabled account's sessions are closed when it is disabled; refused here anyway.
    const user = found && !found.disabled ? found : null
    // Sliding sessions: a session used in its last half is extended.
    if (user && session.expires - Date.now() < (SESSION_DAYS / 2) * 86400_000) {
      await store.update(SESSIONS, [], (list) => ({ value: list.map((s) => (s.id === id ? { ...s, expires: Date.now() + SESSION_DAYS * 86400_000 } : s)) }))
    }
    return user
  }

  async function logout(token) {
    if (!token) return
    const id = sha(token)
    await store.update(SESSIONS, [], (list) => ({ value: list.filter((s) => s.id !== id) }))
  }

  async function updateUser(id, patch) {
    return store.update(USERS, [], (list) => {
      const user = list.find((u) => u.id === id)
      if (!user) throw Object.assign(new Error('missing'), { code: 'missing' })
      const next = { ...user }
      if (patch.role) {
        if (!ROLES.includes(patch.role)) throw Object.assign(new Error('role'), { code: 'role' })
        // Never leave the site without an administrator who can sign in.
        if (user.role === 'admin' && !user.disabled && patch.role !== 'admin' && activeAdmins(list).length <= 1) {
          throw Object.assign(new Error('last-admin'), { code: 'last-admin' })
        }
        next.role = patch.role
      }
      if (patch.password !== undefined) {
        if (String(patch.password).length < MIN_PASSWORD) throw Object.assign(new Error('password'), { code: 'password' })
        next.password = hashPassword(patch.password)
      }
      return { value: list.map((u) => (u.id === id ? next : u)), returns: next }
    }).then(async (user) => {
      // A new password signs out every other device.
      if (patch.password !== undefined) await store.update(SESSIONS, [], (list) => ({ value: list.filter((s) => s.userId !== id) }))
      return user
    })
  }

  async function deleteUser(id) {
    await store.update(USERS, [], (list) => {
      const user = list.find((u) => u.id === id)
      if (!user) throw Object.assign(new Error('missing'), { code: 'missing' })
      if (user.role === 'admin' && !user.disabled && activeAdmins(list).length <= 1) throw Object.assign(new Error('last-admin'), { code: 'last-admin' })
      return { value: list.filter((u) => u.id !== id) }
    })
    await store.update(SESSIONS, [], (list) => ({ value: list.filter((s) => s.userId !== id) }))
  }

  /** The account linked to this Kosmy Board account. Matched on `sub` only: Kosmy Board does not verify emails. */
  async function findByKosmy(sub) {
    if (!sub) return null
    return (await users()).find((u) => u.kosmy?.sub === sub) || null
  }

  /** Link a Kosmy Board account to a Lumy account. One Kosmy Board account opens one Lumy account. */
  async function linkKosmy(id, { sub, name = '', email = '' }) {
    return store.update(USERS, [], (list) => {
      const user = list.find((u) => u.id === id)
      if (!user) throw Object.assign(new Error('missing'), { code: 'missing' })
      if (list.some((u) => u.id !== id && u.kosmy?.sub === sub)) throw Object.assign(new Error('kosmy-taken'), { code: 'kosmy-taken' })
      const next = { ...user, kosmy: { sub, name, email, linkedAt: new Date().toISOString() } }
      return { value: list.map((u) => (u.id === id ? next : u)), returns: next }
    })
  }

  async function unlinkKosmy(id) {
    return store.update(USERS, [], (list) => {
      const user = list.find((u) => u.id === id)
      if (!user) throw Object.assign(new Error('missing'), { code: 'missing' })
      const { kosmy, ...next } = user
      return { value: list.map((u) => (u.id === id ? next : u)), returns: next }
    })
  }

  /**
   * Kosmy Board gives a person access (kosmy.board-users.v1, PUT, or the
   * `kosmy_board_access` claim at sign-in): find the account linked to `sub`,
   * or link an unlinked one with the same email (`linkByEmail`, only when an
   * administrator asked), or create one without a password. Then apply the
   * role and the restrictions, the name and email shown, and enable it.
   * `actor` is the `sub` of the administrator who asked, if any.
   * Errors (code): role, limit (+ field), email-taken, self-admin, last-admin.
   */
  async function provisionKosmy(sub, { name = '', email = '', role, limits } = {}, { actor = null, linkByEmail = false } = {}) {
    if (!ROLES.includes(role)) fail('role')
    if (limits !== undefined && limits !== null && (typeof limits !== 'object' || Array.isArray(limits))) fail('limit', { field: null })
    for (const f of LIMITS) {
      if (limits?.[f.name] !== undefined && typeof limits[f.name] !== 'boolean') fail('limit', { field: f.name })
    }
    const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    name = str(name, 200)
    email = str(email, 200)
    if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) email = ''
    return store.update(USERS, [], (list) => {
      let user = list.find((u) => u.kosmy?.sub === sub)
      let status = 'updated'
      if (!user && email) {
        if (list.some((u) => u.kosmy && (sameEmail(u.kosmy.email, email) || sameEmail(u.email, email)))) {
          // At sign-in, never block on it: the account is created beside the other one.
          if (linkByEmail) fail('email-taken')
        } else if (linkByEmail) {
          user = list.find((u) => !u.kosmy && sameEmail(u.email, email))
          if (user) status = 'linked'
        }
      }
      if (!user) {
        user = { id: randomBytes(8).toString('hex'), username: freeUsername(list, { email, name }), role, createdAt: new Date().toISOString() }
        status = 'created'
      }
      if (user.role === 'admin' && !user.disabled && role !== 'admin' && status !== 'created') {
        if (actor && user.kosmy?.sub === actor) fail('self-admin')
        if (activeAdmins(list).length <= 1) fail('last-admin')
      }
      const { disabled, disabledAt, ...rest } = user
      const next = {
        ...rest,
        role,
        ...(email ? { email } : {}),
        limits: { ...limitsOf(user), ...Object.fromEntries(LIMITS.filter((f) => typeof limits?.[f.name] === 'boolean').map((f) => [f.name, limits[f.name]])) },
        kosmy: { sub, name: name || user.kosmy?.name || '', email: email || user.kosmy?.email || '', linkedAt: user.kosmy?.linkedAt || new Date().toISOString() },
      }
      const value = status === 'created' ? [...list, next] : list.map((u) => (u.id === user.id ? next : u))
      return { value, returns: { status, user: next } }
    })
  }

  /**
   * Kosmy Board removes a person's access: the account linked to `sub` is
   * disabled (its data stays) and its sessions end. Null when there is none.
   * Errors (code): self-disable, last-admin.
   */
  async function disableKosmy(sub, { actor = null } = {}) {
    const user = await store.update(USERS, [], (list) => {
      const found = list.find((u) => u.kosmy?.sub === sub)
      if (!found || found.disabled) return { value: list, returns: null }
      if (actor && sub === actor) fail('self-disable')
      if (found.role === 'admin' && activeAdmins(list).length <= 1) fail('last-admin')
      const next = { ...found, disabled: true, disabledAt: new Date().toISOString() }
      return { value: list.map((u) => (u.id === found.id ? next : u)), returns: next }
    })
    if (user) await store.update(SESSIONS, [], (list) => ({ value: list.filter((s) => s.userId !== user.id) }))
    return user
  }

  return { users, createUser, login, checkPassword, openSession, userFor, logout, updateUser, deleteUser, findByKosmy, linkKosmy, unlinkKosmy, provisionKosmy, disableKosmy }
}

/** Tokens for the remote MCP server: shown once, stored as hashes. */
export function createTokens(store) {
  const FILE = 'tokens.json'
  return {
    async list() {
      return (await store.read(FILE, [])).map(({ hash, ...t }) => t)
    },
    async create({ name, userId, scope = 'write' }) {
      const token = `lumy_${randomBytes(24).toString('base64url')}`
      const entry = { id: randomBytes(6).toString('hex'), name: String(name || 'MCP').slice(0, 60), userId, scope, hash: sha(token), createdAt: new Date().toISOString(), lastUsed: null }
      await store.update(FILE, [], (list) => ({ value: [...list, entry] }))
      const { hash, ...rest } = entry
      return { ...rest, token }
    },
    async revoke(id) {
      await store.update(FILE, [], (list) => ({ value: list.filter((t) => t.id !== id) }))
    },
    async check(token) {
      if (!token) return null
      const hash = sha(token)
      const found = (await store.read(FILE, [])).find((t) => t.hash === hash)
      if (!found) return null
      store.update(FILE, [], (list) => ({ value: list.map((t) => (t.id === found.id ? { ...t, lastUsed: new Date().toISOString() } : t)) })).catch(() => {})
      return found
    },
  }
}

/** A fixed-window limiter: `max` hits per `windowMs` per key. */
export function rateLimiter(max, windowMs) {
  const hits = new Map()
  return (key) => {
    const now = Date.now()
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs)
    if (list.length >= max) {
      hits.set(key, list)
      return false
    }
    list.push(now)
    hits.set(key, list)
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
    return true
  }
}
