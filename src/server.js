/**
 * The Lumy server, shared by `lumy dev` and `lumy serve`.
 *
 * It builds the site, serves it, and adds what a static host cannot do:
 * accounts and a dashboard, private documentation, reader feedback, the
 * reader assistant and the remote MCP server. node:http only.
 *
 * Reading public documentation never needs an account.
 */
import { createServer } from 'node:http'
import { readFile, stat, appendFile, rename, rm } from 'node:fs/promises'
import { watch } from 'node:fs'
import { join, normalize, extname, resolve, sep, dirname, basename } from 'node:path'
import { build, LUMY_ROOT, lumyVersion, printSummary } from './build.js'
import { loadConfig } from './config.js'
import { pageUrl } from './content.js'
import { openStore } from './store.js'
import { createAuth, createTokens, rateLimiter, publicUser, ROLES } from './auth.js'
import { loadSettings, patchSettings, publicSettings, activeProvider } from './settings.js'
import { answer } from './assistant.js'
import { testProvider, providerById } from './providers.js'
import { mcpHandler } from './mcp-http.js'
import { translationReport } from './translations.js'
import { esc, onColor } from './util.js'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
}

/** A request handler for a folder of static files, mounted at `base`. */
export function staticHandler(getDir, base = '/') {
  return async (req, res) => {
    let path
    try {
      path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    } catch {
      res.writeHead(400).end('Bad request')
      return
    }
    if (!path.startsWith(base)) {
      res.writeHead(302, { location: base }).end()
      return
    }
    const dir = resolve(getDir())
    // normalize() collapses "..", then the prefix check keeps us inside the folder.
    let file = normalize(join(dir, path.slice(base.length)))
    if (file !== dir && !file.startsWith(dir + sep)) {
      res.writeHead(403).end('Forbidden')
      return
    }
    try {
      const info = await stat(file)
      if (info.isDirectory()) {
        if (!path.endsWith('/')) {
          res.writeHead(301, { location: path + '/' }).end()
          return
        }
        file = join(file, 'index.html')
      }
      const body = await readFile(file)
      const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream'
      const immutable = /\/_lumy\/[^/]+\.[0-9a-f]{8}\.(css|js)$/.test(path) || path.includes('/_lumy/fonts/')
      res.writeHead(200, {
        'content-type': type,
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        'x-content-type-options': 'nosniff',
      })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch {
      try {
        const body = await readFile(join(dir, '404.html'))
        res.writeHead(404, { 'content-type': TYPES['.html'] }).end(body)
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
      }
    }
  }
}

export async function readBody(req, limit = 64 * 1024) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('Body too large'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function json(res, status, value, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
  res.end(JSON.stringify(value))
}

function cookie(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : ''
}

const clientIp = (req) =>
  (process.env.LUMY_TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || ''

const isHttps = (req, config) => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' || config.url.startsWith('https:')

const ERRORS = {
  username: 'A username has 3 to 40 letters, digits, dots, dashes or underscores.',
  password: 'A password has at least 8 characters.',
  taken: 'This username is already taken.',
  'last-admin': 'The site needs at least one administrator.',
  missing: 'This account does not exist.',
  role: 'Unknown role.',
}

/**
 * Build and serve a site. Returns { handler, rebuild, close } so tests can
 * drive it without a network port.
 */
export async function createApp(rootDir, { dev = false, watchFiles = dev, buildFirst = true, outDir, log = console.log } = {}) {
  const root = resolve(rootDir || '.')
  let config = await loadConfig(root)
  const out = resolve(outDir || (dev ? join(config.root, '.lumy', 'dev') : process.env.LUMY_OUT_DIR || config.outPath))
  const store = await openStore(config)
  const auth = createAuth(store)
  const tokens = createTokens(store)
  const version = await lumyVersion()
  let settings = await loadSettings(store, config)
  const clients = new Set()
  const indexes = new Map()
  const authLimit = rateLimiter(10, 60_000)
  const feedbackLimit = rateLimiter(20, 60_000)
  let askLimit = { perHour: 0, check: null }
  let lastBuild = null

  // An administrator can be created from the environment, for unattended installs.
  if (process.env.LUMY_ADMIN_USER && process.env.LUMY_ADMIN_PASSWORD && !(await auth.users()).length) {
    await auth.createUser({ username: process.env.LUMY_ADMIN_USER, password: process.env.LUMY_ADMIN_PASSWORD, role: 'admin' })
    log(`  Administrator "${process.env.LUMY_ADMIN_USER}" created from the environment.`)
  }

  /** The configuration as the server runs it: the dashboard's switches win. */
  function effectiveConfig() {
    return {
      ...config,
      feedback: { enabled: settings.feedback },
      assistant: { enabled: settings.assistant.enabled && Boolean(settings.assistant.provider) },
      mcp: { enabled: settings.mcp.enabled, url: `${config.url}${config.base}_lumy/mcp` },
      server: { registration: settings.registration === 'open', private: settings.access === 'private' },
    }
  }

  /**
   * Build beside the live site, then swap the folders: readers never meet a
   * half-written site while a page or a setting changes.
   */
  async function buildAndSwap(cfg) {
    const next = join(dirname(out), `.${basename(out)}.next`)
    const old = join(dirname(out), `.${basename(out)}.old`)
    await cleaning
    await rm(next, { recursive: true, force: true })
    const result = await build(cfg, { outDir: next, dev, quiet: true })
    await rm(old, { recursive: true, force: true })
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(out, old).catch((err) => {
          if (err.code !== 'ENOENT') throw err
        })
        await rename(next, out)
        break
      } catch (err) {
        // Windows refuses to rename a folder while a file in it is being read.
        if (attempt >= 20) throw err
        await new Promise((ok) => setTimeout(ok, 50))
      }
    }
    cleaning = rm(old, { recursive: true, force: true }).catch(() => {})
    return result
  }
  let cleaning = Promise.resolve()

  let building = null
  let again = false
  async function rebuild(reason = '') {
    if (building) {
      again = true
      return building
    }
    building = (async () => {
      try {
        config = await loadConfig(root)
        const result = await buildAndSwap(effectiveConfig())
        lastBuild = { at: new Date().toISOString(), pages: result.pages, ms: result.ms, warnings: result.warnings }
        indexes.clear()
        log(`  ${new Date().toLocaleTimeString()}  ${reason ? reason + ' → ' : ''}${result.pages} pages in ${result.ms} ms${result.warnings.length ? `, ${result.warnings.length} warning(s)` : ''}`)
        for (const w of result.warnings.slice(0, 10)) log(`     · ${w.file}: ${w.message}`)
        for (const c of clients) c.write('data: reload\n\n')
      } catch (err) {
        log(`  Build failed: ${err.message}`)
      }
    })()
    await building
    building = null
    if (again) {
      again = false
      await rebuild('more changes')
    }
  }
  if (buildFirst) await rebuild()

  const watchers = []
  if (watchFiles) {
    let timer
    const queue = (what) => {
      clearTimeout(timer)
      timer = setTimeout(() => rebuild(what), 150)
    }
    const paths = [
      [config.docsPath, 'docs'],
      [join(root, 'lumy.config.json'), 'config'],
      ...(dev ? [[join(LUMY_ROOT, 'theme'), 'theme']] : []),
      ...[...(config.scripts || []), ...(config.styles || []), ...[].concat(config.public || [])].filter((p) => !/^https?:/.test(p)).map((p) => [resolve(root, p), p]),
    ]
    for (const [path, label] of paths) {
      try {
        watchers.push(watch(path, { recursive: true }, (_, f) => queue(f ? `${label}/${String(f).replace(/\\/g, '/')}` : label)))
      } catch {
        /* A path that does not exist yet is simply not watched. */
      }
    }
  }

  async function searchIndex(lang) {
    if (!indexes.has(lang)) {
      indexes.set(lang, readFile(join(out, '_lumy', `search-${lang}.json`), 'utf8').then(JSON.parse, () => ({ items: [] })))
    }
    return indexes.get(lang)
  }

  const files = staticHandler(() => out, config.base)
  const mcp = mcpHandler({
    root,
    version,
    tokens,
    readBody,
    canReadAnonymously: async () => settings.mcp.enabled && settings.mcp.publicRead && settings.access === 'public',
    onWrite: (tool) => rebuild(`MCP ${tool}`),
  })

  async function sessionCookie(res, req, token, maxAge = 30 * 86400) {
    const secure = isHttps(req, config) ? '; Secure' : ''
    res.setHeader('set-cookie', `lumy_session=${token}; Path=${config.base}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`)
  }

  /* ── The dashboard page (one HTML shell, the app draws the rest) ──── */
  async function dashboardPage(res, view) {
    const shell = await readFile(join(LUMY_ROOT, 'theme', 'admin', 'index.html'), 'utf8')
    const logo = config.logo ? (/^https?:/.test(config.logo) ? config.logo : config.base + config.logo.replace(/^\//, '')) : ''
    const data = { view, base: config.base, title: config.title, logo, version, brand: config.theme.brand, brandDark: config.theme.brandDark, onBrand: onColor(config.theme.brand), onBrandDark: onColor(config.theme.brandDark), defaultLanguage: config.defaultLanguage, home: pageUrl(config, config.defaultLanguage, '') }
    const html = shell
      .replaceAll('{{title}}', esc(config.title))
      .replaceAll('{{base}}', esc(config.base))
      .replace('{{data}}', JSON.stringify(data).replace(/</g, '\\u003c'))
    res.writeHead(200, {
      'content-type': TYPES['.html'],
      'cache-control': 'no-store',
      'x-frame-options': 'DENY',
      'referrer-policy': 'same-origin',
      'x-content-type-options': 'nosniff',
    })
    res.end(html)
  }

  async function dashboardAsset(res, name) {
    if (!/^[\w.-]+\.(css|js|svg)$/.test(name)) return json(res, 404, { error: 'Not found' })
    try {
      const body = await readFile(join(LUMY_ROOT, 'theme', 'admin', name))
      res.writeHead(200, { 'content-type': TYPES[extname(name)], 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' })
      res.end(body)
    } catch {
      json(res, 404, { error: 'Not found' })
    }
  }

  async function feedbackEntries() {
    try {
      const text = await readFile(join(store.dir, 'feedback.jsonl'), 'utf8')
      return text.split('\n').filter(Boolean).map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      }).filter(Boolean)
    } catch {
      return []
    }
  }

  /* ── The API ──────────────────────────────────────────────────────── */
  async function api(req, res, route, user) {
    const method = req.method
    const need = (roles) => {
      if (!user) {
        json(res, 401, { error: 'Sign in first.', code: 'signin' })
        return false
      }
      if (!roles.includes(user.role)) {
        json(res, 403, { error: 'Your account cannot do this.', code: 'forbidden' })
        return false
      }
      return true
    }
    // Changes come as JSON from this site only: a form on another site can do neither.
    if (method !== 'GET' && method !== 'HEAD') {
      const origin = req.headers.origin
      if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Origin not allowed.' })
      if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'Send JSON.' })
    }
    let body = {}
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      try {
        body = JSON.parse((await readBody(req)) || '{}')
      } catch (err) {
        return json(res, err.status || 400, { error: err.status === 413 ? 'Too large.' : 'Invalid JSON.' })
      }
    }
    const fail = (err) => json(res, err.code && ERRORS[err.code] ? 400 : 500, { error: ERRORS[err.code] || err.message, code: err.code })

    if (route === 'health') return json(res, 200, { ok: true, version, pages: lastBuild?.pages ?? 0 })

    if (route === 'me') {
      return json(res, 200, {
        user: publicUser(user),
        setup: !(await auth.users()).length,
        registration: settings.registration === 'open',
        private: settings.access === 'private',
      })
    }

    if (route === 'auth/setup' && method === 'POST') {
      if ((await auth.users()).length) return json(res, 409, { error: 'The administrator already exists. Sign in instead.', code: 'setup-done' })
      try {
        const created = await auth.createUser({ username: body.username, password: body.password, role: 'admin' })
        await sessionCookie(res, req, await auth.openSession(created.id))
        return json(res, 200, { user: publicUser(created) })
      } catch (err) {
        return fail(err)
      }
    }

    if (route === 'auth/login' && method === 'POST') {
      if (!authLimit(clientIp(req))) return json(res, 429, { error: 'Too many attempts. Wait a minute.', code: 'rate' })
      const result = await auth.login(body.username, body.password)
      if (!result) return json(res, 401, { error: 'Wrong username or password.', code: 'credentials' })
      await sessionCookie(res, req, result.token)
      return json(res, 200, { user: publicUser(result.user) })
    }

    if (route === 'auth/logout' && method === 'POST') {
      await auth.logout(cookie(req, 'lumy_session'))
      await sessionCookie(res, req, '', 0)
      return json(res, 200, { ok: true })
    }

    if (route === 'auth/register' && method === 'POST') {
      if (settings.registration !== 'open') return json(res, 403, { error: 'Sign-ups are closed on this site.', code: 'signups-closed' })
      if (!authLimit(clientIp(req))) return json(res, 429, { error: 'Too many attempts. Wait a minute.', code: 'rate' })
      try {
        const created = await auth.createUser({ username: body.username, password: body.password, role: settings.defaultRole })
        await sessionCookie(res, req, await auth.openSession(created.id))
        return json(res, 200, { user: publicUser(created) })
      } catch (err) {
        return fail(err)
      }
    }

    if (route === 'account/password' && method === 'POST') {
      if (!need(ROLES)) return
      if (!(await auth.checkPassword(user.id, body.current))) return json(res, 400, { error: 'The current password is wrong.', code: 'current-password' })
      try {
        await auth.updateUser(user.id, { password: body.password })
        await sessionCookie(res, req, await auth.openSession(user.id))
        return json(res, 200, { ok: true })
      } catch (err) {
        return fail(err)
      }
    }

    if (route === 'feedback' && method === 'POST') {
      if (!settings.feedback) return json(res, 404, { error: 'Feedback is off.' })
      if (settings.access === 'private' && !user) return json(res, 401, { error: 'Sign in first.' })
      if (!feedbackLimit(clientIp(req))) return json(res, 429, { error: 'Too many votes.' })
      const entry = {
        at: new Date().toISOString(),
        page: String(body.page ?? '').slice(0, 200),
        lang: String(body.lang ?? '').slice(0, 10),
        value: body.value === 'yes' ? 'yes' : 'no',
        comment: String(body.comment ?? '').slice(0, 2000),
      }
      await appendFile(join(store.dir, 'feedback.jsonl'), JSON.stringify(entry) + '\n')
      res.writeHead(204).end()
      return
    }

    if (route === 'ask' && method === 'POST') {
      if (!settings.assistant.enabled || !settings.assistant.provider) return json(res, 503, { error: 'The assistant is not set up on this site.' })
      if (settings.access === 'private' && !user) return json(res, 401, { error: 'Sign in first.' })
      if (askLimit.perHour !== settings.assistant.perHour) askLimit = { perHour: settings.assistant.perHour, check: rateLimiter(settings.assistant.perHour, 3600_000) }
      if (!askLimit.check(clientIp(req))) return json(res, 429, { error: 'Too many questions for now. Try again in a while.' })
      const question = String(body.question ?? '').trim().slice(0, 1000)
      if (!question) return json(res, 400, { error: 'Ask a question.' })
      const lang = config.langCodes.includes(body.lang) ? body.lang : config.defaultLanguage
      const page = typeof body.page === 'string' ? body.page : ''
      return answer(res, {
        settings: activeProvider(store, settings),
        index: await searchIndex(lang),
        question,
        history: Array.isArray(body.history) ? body.history.slice(-6) : [],
        lang,
        pageUrl: pageUrl(config, lang, page),
        title: config.title,
      })
    }

    /* Dashboard */
    if (route === 'admin/overview' && method === 'GET') {
      if (!need(['admin', 'editor'])) return
      const report = await translationReport(config).catch(() => ({}))
      const feedback = await feedbackEntries()
      const since = Date.now() - 30 * 86400_000
      const recent = feedback.filter((f) => Date.parse(f.at) > since)
      const provider = providerById(settings.assistant.provider)
      return json(res, 200, {
        title: config.title,
        languages: config.langCodes,
        build: lastBuild,
        translations: report,
        feedback: { yes: recent.filter((f) => f.value === 'yes').length, no: recent.filter((f) => f.value === 'no').length },
        assistant: { enabled: settings.assistant.enabled, provider: provider?.label || '' },
        access: settings.access,
        registration: settings.registration,
        users: (await auth.users()).length,
      })
    }

    if (route === 'admin/feedback' && method === 'GET') {
      if (!need(['admin', 'editor'])) return
      const byPage = new Map()
      const entries = await feedbackEntries()
      for (const f of entries) {
        const key = `${f.lang}|${f.page}`
        const row = byPage.get(key) || { page: f.page, lang: f.lang, yes: 0, no: 0, last: f.at }
        row[f.value === 'yes' ? 'yes' : 'no']++
        if (f.at > row.last) row.last = f.at
        byPage.set(key, row)
      }
      const comments = entries.filter((f) => f.comment).slice(-100).reverse()
      return json(res, 200, { pages: [...byPage.values()].sort((a, b) => b.no - a.no || b.yes - a.yes), comments })
    }

    if (route === 'admin/settings') {
      if (!need(['admin'])) return
      if (method === 'GET') return json(res, 200, publicSettings(settings))
      if (method === 'PUT') {
        settings = await patchSettings(store, config, body)
        rebuild('settings')
        return json(res, 200, publicSettings(settings))
      }
    }

    if (route === 'admin/assistant/test' && method === 'POST') {
      if (!need(['admin'])) return
      try {
        const provider = activeProvider(store, settings, { provider: body.provider, baseUrl: body.baseUrl, model: body.model, apiKey: body.apiKey })
        if (!provider) return json(res, 400, { error: 'Choose a provider.' })
        return json(res, 200, await testProvider(provider))
      } catch (err) {
        return json(res, 200, { ok: false, error: err.message })
      }
    }

    if (route === 'admin/rebuild' && method === 'POST') {
      if (!need(['admin', 'editor'])) return
      await rebuild('dashboard')
      return json(res, 200, { build: lastBuild })
    }

    if (route === 'admin/users') {
      if (!need(['admin'])) return
      if (method === 'GET') return json(res, 200, { users: (await auth.users()).map(publicUser) })
      if (method === 'POST') {
        try {
          const created = await auth.createUser({ username: body.username, password: body.password, role: body.role })
          return json(res, 200, { user: publicUser(created) })
        } catch (err) {
          return fail(err)
        }
      }
    }
    const userRoute = route.match(/^admin\/users\/([\w-]+)$/)
    if (userRoute) {
      if (!need(['admin'])) return
      try {
        if (method === 'PATCH') return json(res, 200, { user: publicUser(await auth.updateUser(userRoute[1], { role: body.role, password: body.password })) })
        if (method === 'DELETE') {
          await auth.deleteUser(userRoute[1])
          return json(res, 200, { ok: true })
        }
      } catch (err) {
        return fail(err)
      }
    }

    if (route === 'admin/tokens') {
      if (!need(['admin', 'editor'])) return
      if (method === 'GET') {
        const list = await tokens.list()
        const names = new Map((await auth.users()).map((u) => [u.id, u.username]))
        return json(res, 200, {
          tokens: list.filter((t) => user.role === 'admin' || t.userId === user.id).map((t) => ({ ...t, owner: names.get(t.userId) || '—' })),
          url: `${config.url}${config.base}_lumy/mcp`,
        })
      }
      if (method === 'POST') return json(res, 200, { token: await tokens.create({ name: body.name, userId: user.id, scope: body.scope === 'read' ? 'read' : 'write' }) })
    }
    const tokenRoute = route.match(/^admin\/tokens\/([\w-]+)$/)
    if (tokenRoute && method === 'DELETE') {
      if (!need(['admin', 'editor'])) return
      const t = (await tokens.list()).find((x) => x.id === tokenRoute[1])
      if (!t) return json(res, 404, { error: 'Unknown token.' })
      if (user.role !== 'admin' && t.userId !== user.id) return json(res, 403, { error: 'Your account cannot do this.' })
      await tokens.revoke(t.id)
      return json(res, 200, { ok: true })
    }

    return json(res, 404, { error: 'Unknown route.' })
  }

  /* ── Every request ────────────────────────────────────────────────── */
  const publicAsset = (sub) =>
    sub.startsWith('_lumy/fonts/') || sub.startsWith('_lumy/app/') || (config.logo && sub === config.logo.replace(/^\//, '')) || (config.favicon && sub === config.favicon.replace(/^\//, ''))

  async function handler(req, res) {
    let path
    try {
      path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    } catch {
      res.writeHead(400).end('Bad request')
      return
    }
    const base = config.base
    if (!path.startsWith(base)) {
      res.writeHead(302, { location: base }).end()
      return
    }
    const sub = path.slice(base.length)
    try {
      if (dev && sub === '_lumy/live') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
        res.write(': connected\n\n')
        clients.add(res)
        req.on('close', () => clients.delete(res))
        return
      }
      if (sub === '_lumy/mcp') {
        if (!settings.mcp.enabled) return json(res, 404, { error: 'MCP is off on this site.' })
        return await mcp(req, res)
      }
      // Accounts are only looked up where they matter, not for every image.
      const user = () => auth.userFor(cookie(req, 'lumy_session'))
      if (sub.startsWith('_lumy/api/')) return await api(req, res, sub.slice('_lumy/api/'.length), await user())
      if (sub.startsWith('_lumy/app/')) return await dashboardAsset(res, sub.slice('_lumy/app/'.length))
      const view = sub.match(/^_lumy\/(admin|login|setup|register)(\/.*)?$/)
      if (view) return await dashboardPage(res, view[1])

      // Private documentation: every page and file needs a signed-in account.
      if (settings.access === 'private' && !publicAsset(sub) && !(await user())) {
        const wantsPage = String(req.headers.accept || '').includes('text/html')
        if (wantsPage) {
          res.writeHead(302, { location: `${base}_lumy/login?next=${encodeURIComponent(path)}` }).end()
        } else json(res, 401, { error: 'Sign in first.' })
        return
      }
      return await files(req, res)
    } catch (err) {
      log(`  Error on ${req.method} ${path}: ${err.stack || err.message}`)
      if (!res.headersSent) json(res, 500, { error: 'Something went wrong on the server.' })
      else res.end()
    }
  }

  return {
    handler,
    rebuild,
    get config() {
      return config
    },
    get settings() {
      return settings
    },
    store,
    auth,
    tokens,
    async close() {
      for (const w of watchers) w.close()
      for (const c of clients) c.end()
      while (building) await building
      await cleaning
    },
  }
}

function listen(server, port, host) {
  return new Promise((ok, fail) => {
    server.once('error', fail)
    server.listen(port, host, () => ok(server))
  })
}

async function start(rootDir, opts, label) {
  const app = await createApp(rootDir, { ...opts, log: (m) => console.log(m) })
  const server = createServer(app.handler)
  await listen(server, opts.port, opts.host)
  const shown = opts.host === '0.0.0.0' || opts.host === '::' ? 'localhost' : opts.host
  const url = `http://${shown}:${opts.port}${app.config.base}`
  const noAdmin = !(await app.auth.users()).length
  console.log(`\n  Lumy  ${label} on ${url}`)
  console.log(`        dashboard: ${url}_lumy/${noAdmin ? 'setup  (create the administrator account)' : 'admin'}`)
  console.log('        Ctrl+C to stop\n')
  return { server, app }
}

/** `lumy dev`: build into .lumy/dev, serve it, rebuild and reload on every change. */
export function dev(rootDir, { port = 4000, host = '127.0.0.1' } = {}) {
  return start(rootDir, { dev: true, watchFiles: true, port, host }, 'dev server')
}

/** `lumy serve`: build into dist/ and serve it, with the dashboard and the APIs. */
export function serve(rootDir, { port = 4000, host = '127.0.0.1', watch: watchFiles = false, build: buildFirst = true } = {}) {
  return start(rootDir, { dev: false, watchFiles, buildFirst, port, host }, 'serving')
}

export { printSummary }
