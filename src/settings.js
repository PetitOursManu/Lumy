/**
 * Settings changed from the dashboard rather than in lumy.config.json: who can
 * read, who can sign up, and the assistant's provider and key. They belong to
 * the running server, not to the documentation's source, and the key must
 * never land in a repository.
 */
import { PROVIDERS, providerById } from './providers.js'

const FILE = 'settings.json'

export function defaultSettings(config) {
  return {
    access: 'public', // 'public' | 'private'
    registration: 'closed', // 'closed' | 'open'
    defaultRole: 'reader',
    feedback: config.feedback.enabled,
    assistant: {
      enabled: false,
      provider: '',
      perHour: 30,
      providers: Object.fromEntries(PROVIDERS.map((p) => [p.id, { baseUrl: p.baseUrl, model: p.model, apiKey: '' }])),
    },
    mcp: { enabled: true, publicRead: true },
  }
}

export async function loadSettings(store, config) {
  const saved = await store.read(FILE, {})
  const base = defaultSettings(config)
  return {
    ...base,
    ...saved,
    assistant: {
      ...base.assistant,
      ...(saved.assistant || {}),
      providers: Object.fromEntries(
        PROVIDERS.map((p) => [p.id, { ...base.assistant.providers[p.id], ...(saved.assistant?.providers?.[p.id] || {}) }]),
      ),
    },
    mcp: { ...base.mcp, ...(saved.mcp || {}) },
  }
}

/** What the dashboard may see: keys become "saved" flags. */
export function publicSettings(settings) {
  return {
    ...settings,
    assistant: {
      ...settings.assistant,
      providers: Object.fromEntries(
        Object.entries(settings.assistant.providers).map(([id, p]) => [id, { baseUrl: p.baseUrl, model: p.model, hasKey: Boolean(p.apiKey) }]),
      ),
    },
    catalog: PROVIDERS.map(({ id, label, baseUrl, model, keyOptional, hint }) => ({ id, label, baseUrl, model, keyOptional: Boolean(keyOptional), hint: hint || '' })),
  }
}

const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback)

/**
 * Apply a patch from the dashboard. An API key is replaced only when a new one
 * is typed; `null` removes it; an absent or empty field keeps it.
 */
export async function patchSettings(store, config, patch = {}) {
  const current = await loadSettings(store, config)
  const next = {
    ...current,
    access: oneOf(patch.access, ['public', 'private'], current.access),
    registration: oneOf(patch.registration, ['open', 'closed'], current.registration),
    defaultRole: oneOf(patch.defaultRole, ['reader', 'editor'], current.defaultRole),
    feedback: typeof patch.feedback === 'boolean' ? patch.feedback : current.feedback,
    mcp: {
      enabled: typeof patch.mcp?.enabled === 'boolean' ? patch.mcp.enabled : current.mcp.enabled,
      publicRead: typeof patch.mcp?.publicRead === 'boolean' ? patch.mcp.publicRead : current.mcp.publicRead,
    },
    assistant: { ...current.assistant, providers: { ...current.assistant.providers } },
  }
  const a = patch.assistant || {}
  if (typeof a.enabled === 'boolean') next.assistant.enabled = a.enabled
  if (a.provider === '' || providerById(a.provider)) next.assistant.provider = a.provider
  if (Number(a.perHour) > 0) next.assistant.perHour = Math.min(1000, Math.round(Number(a.perHour)))
  for (const [id, p] of Object.entries(a.providers || {})) {
    if (!providerById(id)) continue
    const cur = next.assistant.providers[id]
    next.assistant.providers[id] = {
      baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl.trim() : cur.baseUrl,
      model: typeof p.model === 'string' ? p.model.trim() : cur.model,
      apiKey: p.apiKey === null ? '' : typeof p.apiKey === 'string' && p.apiKey.trim() ? store.encrypt(p.apiKey.trim()) : cur.apiKey,
    }
  }
  await store.set(FILE, next)
  return next
}

/** The provider settings the assistant calls with, key decrypted. */
export function activeProvider(store, settings, override) {
  const id = override?.provider || settings.assistant.provider
  if (!id) return null
  const saved = settings.assistant.providers[id] || {}
  return {
    provider: id,
    baseUrl: override?.baseUrl ?? saved.baseUrl,
    model: override?.model ?? saved.model,
    apiKey: override?.apiKey ? override.apiKey : store.decrypt(saved.apiKey),
  }
}
