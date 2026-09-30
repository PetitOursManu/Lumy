/**
 * lumy.config.json — the one file a site owner edits besides the pages.
 *
 * Every key is optional except `title`. Defaults are chosen so that a folder
 * of Markdown files and a title already make a working site.
 */
import { resolve, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { exists, liftForDark, isNeutral } from './util.js'
import { LANGUAGE_NAMES } from './i18n.js'

export const CONFIG_FILE = 'lumy.config.json'

const DEFAULTS = {
  title: 'Documentation',
  description: '',
  url: '',
  base: '/',
  docsDir: 'docs',
  outDir: 'dist',
  logo: '',
  favicon: '',
  version: '',
  languages: ['en'],
  defaultLanguage: '',
  theme: {},
  nav: null,
  links: [],
  audiences: [],
  github: '',
  editUrl: '',
  issuesUrl: '',
  scripts: [],
  styles: [],
  public: [],
  ui: {},
  search: true,
  llms: true,
  feedback: false,
  assistant: false,
  mcp: false,
  legacyHashRoutes: false,
}

export class ConfigError extends Error {}

export async function loadConfig(rootDir) {
  const root = resolve(rootDir || '.')
  const file = join(root, CONFIG_FILE)
  if (!(await exists(file))) {
    throw new ConfigError(`No ${CONFIG_FILE} in ${root}. Run "lumy init" to create a site, or pass --root.`)
  }
  let raw
  try {
    raw = JSON.parse(await readFile(file, 'utf8'))
  } catch (err) {
    throw new ConfigError(`${CONFIG_FILE} is not valid JSON: ${err.message}`)
  }
  return normalizeConfig(raw, root)
}

export function normalizeConfig(raw, root) {
  const config = { ...DEFAULTS, ...raw }
  config.root = root
  config.docsPath = resolve(root, config.docsDir)
  config.outPath = resolve(root, config.outDir)

  // base always starts and ends with a slash: "/" or "/docs/".
  let base = String(config.base || '/').trim()
  if (!base.startsWith('/')) base = '/' + base
  if (!base.endsWith('/')) base += '/'
  config.base = base
  config.url = String(config.url || '').replace(/\/+$/, '')

  // Languages: ["en", "fr"] or [{ code, label }]. The first one is the default.
  config.languages = (config.languages.length ? config.languages : ['en']).map((l) =>
    typeof l === 'string' ? { code: l, label: LANGUAGE_NAMES[l] || l } : { code: l.code, label: l.label || LANGUAGE_NAMES[l.code] || l.code },
  )
  config.langCodes = config.languages.map((l) => l.code)
  if (!config.defaultLanguage || !config.langCodes.includes(config.defaultLanguage)) {
    config.defaultLanguage = config.langCodes[0]
  }

  // Theme: one brand colour is enough; the dark one is derived when absent.
  // Neutral by default, like Lumy's logo: near-black, which turns white in the
  // dark theme — a lifted black would only be grey.
  const theme = { brand: '#18181b', radius: 12, ...config.theme }
  theme.brandDark = theme.brandDark || (isNeutral(theme.brand) ? '#fafafa' : liftForDark(theme.brand))
  config.theme = theme

  config.audiences = (config.audiences || []).map((a) => (typeof a === 'string' ? { id: a, label: a } : a))
  config.feedback = normalizeFeature(config.feedback)
  config.assistant = normalizeFeature(config.assistant)
  config.mcp = normalizeFeature(config.mcp)
  return config
}

/** `true` → { enabled: true }, "https://…" → { enabled: true, endpoint }, object kept. */
function normalizeFeature(value) {
  if (!value) return { enabled: false }
  if (value === true) return { enabled: true }
  if (typeof value === 'string') return { enabled: true, endpoint: value }
  return { enabled: value.enabled !== false, ...value }
}
