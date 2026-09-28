/**
 * The MCP server over HTTP ("Streamable HTTP" transport), at /_lumy/mcp.
 *
 * Reading tools are open when the site is public: anyone may point an
 * assistant at the documentation, as anyone may read it. Writing tools need
 * an access token, created in the dashboard and sent as "Authorization:
 * Bearer lumy_…". Every answer is plain JSON; the server never opens a stream,
 * which the transport allows.
 */
import { createTools, handleRpc, READ_TOOLS } from './mcp.js'

export function mcpHandler({ root, version, tokens, canReadAnonymously, onWrite, readBody }) {
  const tools = createTools(root)
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' }).end()
      return
    }
    // A browser on another site must not drive this server (DNS rebinding).
    const origin = req.headers.origin
    if (origin && new URL(origin).host !== req.headers.host) {
      res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Origin not allowed' }))
      return
    }
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    const token = bearer ? await tokens.check(bearer) : null
    if (bearer && !token) {
      res.writeHead(401, { 'www-authenticate': 'Bearer', 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Unknown or revoked token' }))
      return
    }
    if (!token && !(await canReadAnonymously())) {
      res.writeHead(401, { 'www-authenticate': 'Bearer', 'content-type': 'application/json' }).end(JSON.stringify({ error: 'This documentation needs an access token' }))
      return
    }
    let body
    try {
      body = JSON.parse(await readBody(req, 4 * 1024 * 1024))
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }))
      return
    }
    const canWrite = token?.scope === 'write'
    const ctx = { tools, version, allow: (name) => READ_TOOLS.has(name) || canWrite, onWrite }
    const batch = Array.isArray(body)
    const responses = (await Promise.all((batch ? body : [body]).map((m) => handleRpc(m, ctx)))).filter(Boolean)
    if (!responses.length) {
      res.writeHead(202).end()
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(batch ? responses : responses[0]))
  }
}
