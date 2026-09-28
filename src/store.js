/**
 * What `lumy serve` keeps between restarts: settings, accounts, sessions,
 * access tokens, feedback. Plain JSON files in one folder, `.lumy/` beside the
 * site by default, or LUMY_DATA_DIR (a Docker volume, say). No database.
 *
 * Writes go to a temporary file first and are then renamed over the old one,
 * so a crash in the middle of a write never leaves half a file.
 */
import { join } from 'node:path'
import { readFile, writeFile, rename, mkdir, chmod } from 'node:fs/promises'
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto'

export function dataDir(config) {
  return process.env.LUMY_DATA_DIR || join(config.root, '.lumy')
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  await rename(tmp, file)
}

/**
 * The key that encrypts provider API keys at rest. LUMY_SECRET when set (any
 * string, hashed to 32 bytes), otherwise a random key created once in the data
 * folder. Losing it only means re-entering the API keys.
 */
async function masterKey(dir) {
  if (process.env.LUMY_SECRET) return createHash('sha256').update(process.env.LUMY_SECRET).digest()
  const file = join(dir, 'secret.key')
  try {
    const hex = (await readFile(file, 'utf8')).trim()
    if (/^[0-9a-f]{64}$/.test(hex)) return Buffer.from(hex, 'hex')
  } catch {}
  const key = randomBytes(32)
  await writeFile(file, key.toString('hex') + '\n', { mode: 0o600 })
  await chmod(file, 0o600).catch(() => {})
  return key
}

export async function openStore(config) {
  const dir = dataDir(config)
  await mkdir(dir, { recursive: true })
  const key = await masterKey(dir)
  const file = (name) => join(dir, name)

  // One writer at a time per file, so two requests never interleave writes.
  const queues = new Map()
  function update(name, fallback, fn) {
    const prev = queues.get(name) || Promise.resolve()
    const next = prev.then(async () => {
      const current = await readJson(file(name), fallback)
      const result = await fn(current)
      await writeJson(file(name), result.value)
      return result.returns
    })
    queues.set(name, next.catch(() => {}))
    return next
  }

  return {
    dir,
    read: (name, fallback) => readJson(file(name), fallback),
    /** fn(current) → { value, returns } */
    update,
    set: (name, value) => update(name, null, () => ({ value })),
    encrypt(text) {
      if (!text) return ''
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
      return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`
    },
    decrypt(value) {
      if (!value) return ''
      try {
        const [, iv, tag, data] = String(value).split(':')
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
        decipher.setAuthTag(Buffer.from(tag, 'base64'))
        return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
      } catch {
        return ''
      }
    },
  }
}
