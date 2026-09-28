import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createApp } from '../src/server.js'
import { retrieve } from '../src/assistant.js'
import { chat } from '../src/providers.js'
import { tempSite, SAMPLE } from './helpers.js'

/** Start the app on a free port; `call` sends a request and keeps the session cookie. */
async function start(files = SAMPLE) {
  const site = await tempSite(files)
  const app = await createApp(site.root, { log: () => {} })
  const server = createServer(app.handler)
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  let cookie = ''
  async function call(path, { method = 'GET', body, headers = {}, raw = false, keepCookie = true } = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie && keepCookie ? { cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.get('set-cookie')
    if (set && keepCookie) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0]
    if (raw) return res
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: res.status, json, text, headers: res.headers }
  }
  return {
    app,
    call,
    base,
    root: site.root,
    forget: () => (cookie = ''),
    async stop() {
      await app.close()
      await new Promise((ok) => server.close(ok))
      await site.cleanup()
    },
  }
}

/** A fake OpenAI-compatible provider that streams its answer and records the request. */
async function fakeProvider(answerText = 'Use **Docker** [1].') {
  const seen = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const c of req) body += c
    seen.push({ url: req.url, headers: req.headers, body: JSON.parse(body) })
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const part of answerText.match(/.{1,6}/g)) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`)
    res.end('data: [DONE]\n\n')
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  return { url: `http://127.0.0.1:${server.address().port}`, seen, stop: () => new Promise((ok) => server.close(ok)) }
}

test('first run: the first account is the administrator, and there is only one first run', async () => {
  const s = await start()
  try {
    assert.equal((await s.call('/_lumy/api/health')).json.ok, true)
    assert.equal((await s.call('/_lumy/api/me')).json.setup, true)
    assert.equal((await s.call('/_lumy/api/auth/setup', { method: 'POST', body: { username: 'ad', password: 'longenough' } })).status, 400)
    const setup = await s.call('/_lumy/api/auth/setup', { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
    assert.equal(setup.json.user.role, 'admin')
    assert.equal((await s.call('/_lumy/api/me')).json.user.username, 'admin')
    assert.equal((await s.call('/_lumy/api/auth/setup', { method: 'POST', body: { username: 'other', password: 'correct horse' } })).status, 409)

    s.forget()
    assert.equal((await s.call('/_lumy/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'nope nope' } })).status, 401)
    assert.equal((await s.call('/_lumy/api/auth/login', { method: 'POST', body: { username: 'ADMIN', password: 'correct horse' } })).status, 200)

    // Users file never holds a password in clear.
    const users = await readFile(join(s.root, '.lumy', 'users.json'), 'utf8')
    assert.doesNotMatch(users, /correct horse/)
    assert.match(users, /scrypt:/)

    // The dashboard page is served, framed by nothing.
    const page = await s.call('/_lumy/admin')
    assert.equal(page.headers.get('x-frame-options'), 'DENY')
    assert.match(page.text, /"view":"admin"/)
  } finally {
    await s.stop()
  }
})

test('changes need JSON from this site: forms and other origins are refused', async () => {
  const s = await start()
  try {
    const form = await s.call('/_lumy/api/auth/login', { method: 'POST', raw: true, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    assert.equal(form.status, 415)
    const foreign = await s.call('/_lumy/api/auth/login', { method: 'POST', body: {}, headers: { origin: 'https://evil.example' } })
    assert.equal(foreign.status, 403)
  } finally {
    await s.stop()
  }
})

test('roles: sign-ups closed by default, readers stay out of the dashboard', async () => {
  const s = await start()
  try {
    await s.call('/_lumy/api/auth/setup', { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
    assert.equal((await s.call('/_lumy/api/admin/overview')).status, 200)
    await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { registration: 'open' } })
    s.forget()
    assert.equal((await s.call('/_lumy/api/admin/overview')).status, 401)
    const reg = await s.call('/_lumy/api/auth/register', { method: 'POST', body: { username: 'reader1', password: 'reading is fun' } })
    assert.equal(reg.json.user.role, 'reader')
    assert.equal((await s.call('/_lumy/api/admin/overview')).status, 403)
    assert.equal((await s.call('/_lumy/api/admin/settings')).status, 403)
  } finally {
    await s.stop()
  }
})

test('private documentation needs an account; public assets for the sign-in page do not', async () => {
  const s = await start()
  try {
    await s.call('/_lumy/api/auth/setup', { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
    await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { access: 'private' } })
    await s.app.rebuild()
    assert.equal((await s.call('/en/')).status, 200)
    s.forget()
    const page = await s.call('/en/', { headers: { accept: 'text/html' } })
    assert.equal(page.status, 302)
    assert.equal(page.headers.get('location'), '/_lumy/login?next=%2Fen%2F')
    assert.equal((await s.call('/_lumy/search-en.json')).status, 401)
    assert.equal((await s.call('/llms.txt')).status, 401)
    assert.equal((await s.call('/assets/logo.png')).status, 200)
    assert.equal((await s.call('/_lumy/fonts/Geist-Variable.woff2')).status, 200)
  } finally {
    await s.stop()
  }
})

test('API keys are encrypted at rest and never returned', async () => {
  const s = await start()
  try {
    await s.call('/_lumy/api/auth/setup', { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
    const put = await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { assistant: { provider: 'openai', providers: { openai: { apiKey: 'sk-secret-123' } } } } })
    assert.equal(put.json.assistant.providers.openai.hasKey, true)
    assert.doesNotMatch(put.text, /sk-secret-123/)
    const file = await readFile(join(s.root, '.lumy', 'settings.json'), 'utf8')
    assert.doesNotMatch(file, /sk-secret-123/)
    assert.match(file, /"apiKey": "v1:/)
    assert.equal(s.app.store.decrypt(JSON.parse(file).assistant.providers.openai.apiKey), 'sk-secret-123')
    // An empty field keeps the key; null removes it.
    await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { assistant: { providers: { openai: { apiKey: '' } } } } })
    assert.equal((await s.call('/_lumy/api/admin/settings')).json.assistant.providers.openai.hasKey, true)
    await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { assistant: { providers: { openai: { apiKey: null } } } } })
    assert.equal((await s.call('/_lumy/api/admin/settings')).json.assistant.providers.openai.hasKey, false)
  } finally {
    await s.stop()
  }
})

test('feedback is stored and summarised for the dashboard', async () => {
  const s = await start()
  try {
    await s.call('/_lumy/api/auth/setup', { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
    assert.equal((await s.call('/_lumy/api/feedback', { method: 'POST', body: { page: 'install', lang: 'en', value: 'yes' } })).status, 204)
    await s.call('/_lumy/api/feedback', { method: 'POST', body: { page: 'install', lang: 'en', value: 'no', comment: 'Missing Windows steps' } })
    const f = await s.call('/_lumy/api/admin/feedback')
    assert.deepEqual(f.json.pages[0], { page: 'install', lang: 'en', yes: 1, no: 1, last: f.json.pages[0].last })
    assert.equal(f.json.comments[0].comment, 'Missing Windows steps')
    assert.deepEqual((await s.call('/_lumy/api/admin/overview')).json.feedback, { yes: 1, no: 1 })
  } finally {
    await s.stop()
  }
})

test('the assistant answers from the docs, streaming, with its sources', async () => {
  const provider = await fakeProvider('Run it with **Docker** [1].')
  const s = await start()
  try {
    assert.equal((await s.call('/_lumy/api/ask', { method: 'POST', body: { question: 'How to install?' } })).status, 503)
    await s.call('/_lumy/api/auth/setup', { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
    await s.call('/_lumy/api/admin/settings', {
      method: 'PUT',
      body: { assistant: { enabled: true, provider: 'custom', providers: { custom: { baseUrl: provider.url, model: 'test-model', apiKey: 'k-1' } } } },
    })
    await s.app.rebuild()
    // The pages now offer "Ask AI".
    assert.match(await readFile(join(s.root, 'dist/en/install/index.html'), 'utf8'), /data-lm="ask"/)

    const test = await s.call('/_lumy/api/admin/assistant/test', { method: 'POST', body: { provider: 'custom' } })
    assert.equal(test.json.ok, true)

    s.forget()
    const res = await s.call('/_lumy/api/ask', { method: 'POST', body: { question: 'How do I use Docker?', lang: 'en', page: 'install' } })
    assert.equal(res.status, 200)
    const lines = res.text.trim().split('\n').map((l) => JSON.parse(l))
    assert.equal(lines[0].type, 'sources')
    assert.equal(lines[0].sources[0].url, '/en/install/#docker')
    assert.equal(lines.filter((l) => l.type === 'text').map((l) => l.text).join(''), 'Run it with **Docker** [1].')
    assert.equal(lines.at(-1).type, 'done')

    const sent = provider.seen.at(-1)
    assert.equal(sent.url, '/v1/chat/completions')
    assert.equal(sent.headers.authorization, 'Bearer k-1')
    assert.equal(sent.body.model, 'test-model')
    assert.equal(sent.body.stream, true)
    assert.match(sent.body.messages[0].content, /Answer in English/)
    assert.match(sent.body.messages.at(-1).content, /\[1\] Install › Docker/)
  } finally {
    await s.stop()
    await provider.stop()
  }
})

test('providers: Ollama streams NDJSON, fal sends its key as "Key", errors are explained', async () => {
  const seen = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const c of req) body += c
    seen.push({ url: req.url, auth: req.headers.authorization })
    if (req.url === '/fail/v1/chat/completions') return res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'Invalid key' } }))
    if (req.url === '/api/chat') {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' })
      res.write(JSON.stringify({ message: { content: 'Hel' }, done: false }) + '\n')
      res.end(JSON.stringify({ message: { content: 'lo' }, done: true }) + '\n')
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: 'plain' } }] }))
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${server.address().port}`
  try {
    const parts = []
    assert.equal(await chat({ provider: 'ollama', baseUrl: url, model: 'm' }, [{ role: 'user', content: 'hi' }], { onText: (t) => parts.push(t) }), 'Hello')
    assert.deepEqual(parts, ['Hel', 'lo'])
    assert.equal(await chat({ provider: 'fal', baseUrl: url, model: 'm', apiKey: 'id:secret' }, [{ role: 'user', content: 'hi' }]), 'plain')
    assert.equal(seen.at(-1).auth, 'Key id:secret')
    await assert.rejects(chat({ provider: 'custom', baseUrl: `${url}/fail`, model: 'm', apiKey: 'x' }, []), /answered 401: Invalid key/)
    await assert.rejects(chat({ provider: 'openai', model: 'm' }, []), /No API key saved for OpenAI/)
  } finally {
    await new Promise((ok) => server.close(ok))
  }
})

test('retrieval prefers headings and the reader’s page, and ignores stop words', () => {
  const items = [
    { k: 's', p: 'Install', h: 'Docker', u: '/en/install/#docker', t: 'Run the container with docker compose.' },
    { k: 's', p: 'Deploy', h: 'Reverse proxy', u: '/en/deploy/#proxy', t: 'Put nginx in front of docker.' },
    { k: 's', p: 'Glossary', h: 'Muse', u: '/en/glossary/#muse', t: 'The design switch.' },
  ]
  assert.equal(retrieve(items, 'How do I use Docker?')[0].u, '/en/install/#docker')
  assert.deepEqual(retrieve(items, 'the of and'), [])
  // Between two sections that match alike, the reader's page wins.
  const even = [
    { k: 's', p: 'Install', h: 'Ports', u: '/en/install/#ports', t: 'The port is 8080.' },
    { k: 's', p: 'Deploy', h: 'Ports', u: '/en/deploy/#ports', t: 'The port is 8080.' },
  ]
  assert.equal(retrieve(even, 'which port', { pageUrl: '/en/deploy/' })[0].u, '/en/deploy/#ports')
})

test('remote MCP: anyone reads a public site, writing needs a token and rebuilds the site', async () => {
  const s = await start()
  try {
    const rpc = (body, headers = {}) => s.call('/_lumy/mcp', { method: 'POST', body, headers, keepCookie: false })
    const list = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const names = list.json.result.tools.map((t) => t.name)
    assert.ok(names.includes('read_page') && !names.includes('write_page'))
    const denied = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'write_page', arguments: { slug: 'new', content: '# New' } } })
    assert.match(denied.json.result.content[0].text, /needs an access token/)
    assert.equal((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202)
    assert.equal((await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, { authorization: 'Bearer lumy_nope' })).status, 401)

    await s.call('/_lumy/api/auth/setup', { method: 'POST', body: { username: 'admin', password: 'correct horse' } })
    const { json } = await s.call('/_lumy/api/admin/tokens', { method: 'POST', body: { name: 'test' } })
    const auth = { authorization: `Bearer ${json.token.token}` }
    const wrote = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'write_page', arguments: { slug: 'new-page', content: '# New page\n\nHello.' } } }, auth)
    assert.equal(wrote.json.result.isError, undefined)
    // The write triggered a rebuild: the page is online.
    let page
    for (let i = 0; i < 50 && page?.status !== 200; i++) {
      await new Promise((ok) => setTimeout(ok, 100))
      page = await s.call('/en/new-page/')
    }
    assert.equal(page.status, 200)
    assert.match(page.text, /<h1>New page<\/h1>/)
    const tokens = await s.call('/_lumy/api/admin/tokens')
    assert.ok(tokens.json.tokens[0].lastUsed)

    // Private sites close MCP reading too.
    await s.call('/_lumy/api/admin/settings', { method: 'PUT', body: { access: 'private' } })
    assert.equal((await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/list' })).status, 401)
    assert.equal((await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/list' }, auth)).status, 200)
  } finally {
    await s.stop()
  }
})
