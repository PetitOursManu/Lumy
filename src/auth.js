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

/** Public view of an account: never the password hash. */
export const publicUser = (u) => (u ? { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt } : null)

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
    const user = (await users()).find((u) => u.id === session.userId) || null
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
        // Never leave the site without an administrator.
        if (user.role === 'admin' && patch.role !== 'admin' && list.filter((u) => u.role === 'admin').length === 1) {
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
      if (user.role === 'admin' && list.filter((u) => u.role === 'admin').length === 1) throw Object.assign(new Error('last-admin'), { code: 'last-admin' })
      return { value: list.filter((u) => u.id !== id) }
    })
    await store.update(SESSIONS, [], (list) => ({ value: list.filter((s) => s.userId !== id) }))
  }

  return { users, createUser, login, checkPassword, openSession, userFor, logout, updateUser, deleteUser }
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
