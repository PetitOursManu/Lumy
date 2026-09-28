/**
 * Language-model providers for the reader assistant.
 *
 * Two dialects cover them all: Ollama's own chat API, and the OpenAI chat
 * completions API, which OpenAI, Anthropic, Google, OpenRouter, fal.ai,
 * Mistral, Groq and most self-hosted servers also speak. A provider is only a
 * name, an address, a model and a way to send the key.
 */

export const PROVIDERS = [
  { id: 'ollama', label: 'Ollama', dialect: 'ollama', baseUrl: 'https://ollama.com', path: '/api/chat', model: 'gpt-oss:120b', keyOptional: true, hint: 'Ollama Cloud, or http://localhost:11434 for a local Ollama (no key).' },
  { id: 'openai', label: 'OpenAI', dialect: 'openai', baseUrl: 'https://api.openai.com', path: '/v1/chat/completions', model: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic (Claude)', dialect: 'openai', baseUrl: 'https://api.anthropic.com', path: '/v1/chat/completions', model: 'claude-haiku-4-5' },
  { id: 'google', label: 'Google (Gemini)', dialect: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', path: '/chat/completions', model: 'gemini-2.5-flash' },
  { id: 'openrouter', label: 'OpenRouter', dialect: 'openai', baseUrl: 'https://openrouter.ai/api', path: '/v1/chat/completions', model: 'openai/gpt-4o-mini' },
  { id: 'fal', label: 'fal.ai', dialect: 'openai', auth: 'key', baseUrl: 'https://fal.run/openrouter/router/openai', path: '/v1/chat/completions', model: 'openai/gpt-4o-mini', hint: 'fal routes chat models through OpenRouter: use ids such as openai/gpt-4o-mini.' },
  { id: 'mistral', label: 'Mistral', dialect: 'openai', baseUrl: 'https://api.mistral.ai', path: '/v1/chat/completions', model: 'mistral-small-latest' },
  { id: 'groq', label: 'Groq', dialect: 'openai', baseUrl: 'https://api.groq.com/openai', path: '/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
  { id: 'custom', label: 'OpenAI-compatible', dialect: 'openai', baseUrl: '', path: '/v1/chat/completions', model: '', keyOptional: true, hint: 'Any server with /v1/chat/completions: LM Studio, vLLM, LocalAI, Together…' },
]

export const providerById = (id) => PROVIDERS.find((p) => p.id === id) || null

export class ProviderError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function endpoint(def, baseUrl) {
  const base = String(baseUrl || def.baseUrl || '').replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base)) throw new ProviderError('The provider address must start with http:// or https://.')
  // An address that already ends with the path is used as it is.
  return base.endsWith(def.path) ? base : base + def.path
}

function headers(def, apiKey) {
  const h = { 'content-type': 'application/json', accept: 'application/json, text/event-stream, application/x-ndjson' }
  if (apiKey) h.authorization = def.auth === 'key' ? `Key ${apiKey}` : `Bearer ${apiKey}`
  if (def.id === 'openrouter') {
    h['x-title'] = 'Lumy'
    h['http-referer'] = 'https://github.com/PetitOursManu/Lumy'
  }
  return h
}

/** The text of an error body, whatever shape the provider gave it. */
function errorText(body) {
  try {
    const j = JSON.parse(body)
    const e = j.error ?? j
    if (typeof e === 'string') return e
    return e.message || e.detail || JSON.stringify(e).slice(0, 300)
  } catch {
    return String(body).slice(0, 300)
  }
}

/**
 * Send a chat and stream the answer. `onText` receives each piece of text as
 * it arrives. Resolves with the full answer.
 *
 * @param {{ provider: string, baseUrl?: string, model?: string, apiKey?: string }} settings
 * @param {{ role: string, content: string }[]} messages
 */
export async function chat(settings, messages, { onText = () => {}, signal, timeoutMs = 90_000, maxTokens = 1200 } = {}) {
  const def = providerById(settings.provider)
  if (!def) throw new ProviderError(`Unknown provider "${settings.provider}".`)
  const model = String(settings.model || def.model || '').trim()
  if (!model) throw new ProviderError('No model chosen for this provider.')
  if (!settings.apiKey && !def.keyOptional) throw new ProviderError(`No API key saved for ${def.label}.`)

  const url = endpoint(def, settings.baseUrl)
  const body =
    def.dialect === 'ollama'
      ? { model, messages, stream: true, options: { temperature: 0.2, num_predict: maxTokens } }
      : { model, messages, stream: true, temperature: 0.2, max_tokens: maxTokens }

  const timeout = AbortSignal.timeout(timeoutMs)
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(def, settings.apiKey),
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch((err) => {
    throw new ProviderError(err.name === 'TimeoutError' ? `${def.label} did not answer in time.` : `Cannot reach ${def.label}: ${err.cause?.code || err.message}`)
  })
  if (!res.ok) throw new ProviderError(`${def.label} answered ${res.status}: ${errorText(await res.text())}`, res.status)

  let full = ''
  const take = (text) => {
    if (!text) return
    full += text
    onText(text)
  }
  const type = res.headers.get('content-type') || ''
  // Some servers ignore "stream" and answer in one JSON document.
  if (type.includes('application/json') && !type.includes('ndjson')) {
    const j = await res.json()
    if (j.error) throw new ProviderError(`${def.label}: ${errorText(JSON.stringify(j))}`)
    take(j.message?.content ?? j.choices?.[0]?.message?.content ?? '')
    return full
  }

  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      handleLine(line)
    }
  }
  handleLine(buffer.trim())
  return full

  function handleLine(line) {
    if (!line || line.startsWith(':') || line.startsWith('event:')) return
    const data = line.startsWith('data:') ? line.slice(5).trim() : line
    if (data === '[DONE]') return
    let j
    try {
      j = JSON.parse(data)
    } catch {
      return
    }
    // OpenRouter reports some failures inside a 200 stream.
    if (j.error) throw new ProviderError(`${def.label}: ${errorText(JSON.stringify(j))}`)
    take(def.dialect === 'ollama' ? j.message?.content : j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content)
  }
}

/** A tiny request, to check an address, a key and a model from the dashboard. */
export async function testProvider(settings) {
  const started = Date.now()
  const answer = await chat(settings, [{ role: 'user', content: 'Reply with the single word: ready' }], { timeoutMs: 30_000, maxTokens: 20 })
  return { ok: true, ms: Date.now() - started, answer: answer.trim().slice(0, 80) }
}
