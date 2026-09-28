/**
 * Serving a built site: `lumy dev` (rebuilds and reloads on every save) and
 * `lumy serve` (the built folder as it is, plus the optional feedback API).
 * node:http only; nothing to install.
 */
import { createServer } from 'node:http'
import { readFile, stat, appendFile, mkdir } from 'node:fs/promises'
import { watch } from 'node:fs'
import { join, normalize, extname, resolve, sep } from 'node:path'
import { build, LUMY_ROOT, printSummary } from './build.js'
import { loadConfig } from './config.js'

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
    const rel = path.slice(base.length)
    // normalize() collapses "..", then the prefix check keeps us inside the folder.
    let file = normalize(join(dir, rel))
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

function listen(server, port, host) {
  return new Promise((ok, fail) => {
    server.once('error', fail)
    server.listen(port, host, () => ok(server))
  })
}

async function readBody(req, limit = 32 * 1024) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('Body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Feedback from "Was this page helpful?", appended as one JSON line per vote.
 * No account and no cookie: what is stored is the page, the answer, the
 * optional comment and the time.
 */
function feedbackRoute(config) {
  const file = join(config.root, '.lumy', 'feedback.jsonl')
  const recent = new Map()
  return async (req, res) => {
    if (req.method !== 'POST') return res.writeHead(405).end()
    try {
      const data = JSON.parse(await readBody(req))
      const ip = req.socket.remoteAddress || ''
      const now = Date.now()
      // A gentle limit: 20 votes a minute from one address.
      const times = (recent.get(ip) || []).filter((t) => now - t < 60_000)
      if (times.length >= 20) return res.writeHead(429).end()
      recent.set(ip, [...times, now])
      const entry = {
        at: new Date(now).toISOString(),
        page: String(data.page ?? '').slice(0, 200),
        lang: String(data.lang ?? '').slice(0, 10),
        value: data.value === 'yes' ? 'yes' : 'no',
        comment: String(data.comment ?? '').slice(0, 2000),
      }
      await mkdir(join(config.root, '.lumy'), { recursive: true })
      await appendFile(file, JSON.stringify(entry) + '\n')
      res.writeHead(204).end()
    } catch {
      res.writeHead(400).end()
    }
  }
}

/** `lumy serve`: the built site, and the feedback endpoint when it is switched on. */
export async function serve(config, { port = 4000, host = '127.0.0.1' } = {}) {
  const files = staticHandler(() => config.outPath, config.base)
  const feedback = config.feedback.enabled && !config.feedback.endpoint ? feedbackRoute(config) : null
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0]
    if (feedback && path === `${config.base}_lumy/api/feedback`) return feedback(req, res)
    return files(req, res)
  })
  await listen(server, port, host)
  console.log(`\n  Lumy  serving ${config.outDir}/ on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}${config.base}\n`)
  return server
}

/** `lumy dev`: build into .lumy/dev, serve it, rebuild and reload on every change. */
export async function dev(rootDir, { port = 4000, host = '127.0.0.1' } = {}) {
  let config = await loadConfig(rootDir)
  const out = join(config.root, '.lumy', 'dev')
  const clients = new Set()
  let building = null
  let again = false

  async function rebuild(reason) {
    if (building) {
      again = true
      return building
    }
    building = (async () => {
      try {
        config = await loadConfig(rootDir)
        const result = await build(config, { outDir: out, dev: true, quiet: true })
        const time = new Date().toLocaleTimeString()
        console.log(`  ${time}  ${reason ? reason + ' → ' : ''}${result.pages} pages in ${result.ms} ms${result.warnings.length ? `, ${result.warnings.length} warning(s)` : ''}`)
        for (const w of result.warnings.slice(0, 10)) console.log(`     · ${w.file}: ${w.message}`)
        for (const c of clients) c.write('data: reload\n\n')
      } catch (err) {
        console.error(`  Build failed: ${err.message}`)
      }
    })()
    await building
    building = null
    if (again) {
      again = false
      await rebuild('more changes')
    }
  }

  const first = await build(config, { outDir: out, dev: true, quiet: true })
  printSummary({ ...first, out })

  const files = staticHandler(() => out, config.base)
  const feedback = feedbackRoute(config)
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0]
    if (path === `${config.base}_lumy/live`) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    if (path === `${config.base}_lumy/api/feedback`) return feedback(req, res)
    return files(req, res)
  })
  await listen(server, port, host)
  console.log(`  Lumy  dev server on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}${config.base}  (Ctrl+C to stop)\n`)

  let timer
  const queue = (what) => {
    clearTimeout(timer)
    timer = setTimeout(() => rebuild(what), 120)
  }
  const watched = [
    [config.docsPath, 'docs'],
    [join(config.root, 'lumy.config.json'), 'config'],
    [join(LUMY_ROOT, 'theme'), 'theme'],
    ...[...(config.scripts || []), ...(config.styles || [])].filter((p) => !/^https?:/.test(p)).map((p) => [resolve(config.root, p), p]),
  ]
  for (const [path, label] of watched) {
    try {
      watch(path, { recursive: true }, (_, file) => queue(file ? `${label}/${String(file).replace(/\\/g, '/')}` : label))
    } catch {
      /* A path that does not exist yet is simply not watched. */
    }
  }
  return server
}
