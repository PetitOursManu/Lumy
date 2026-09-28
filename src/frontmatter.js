/**
 * Front matter: the small block of settings at the top of a page.
 *
 *     ---
 *     title: Getting started
 *     description: Install the app and create the first account.
 *     audience: [user, admin]
 *     ---
 *
 * Only the part of YAML a page actually needs is supported: strings, numbers,
 * booleans, inline lists and dash lists. Anything fancier is a sign the setting
 * belongs in lumy.config.json instead.
 */

const FENCE = /^---\n([\s\S]*?)\n---\n?/

export function parseFrontmatter(source) {
  const text = String(source)
  const match = text.match(FENCE)
  if (!match) return { data: {}, body: text, raw: '' }
  return { data: parseYamlSubset(match[1]), body: text.slice(match[0].length), raw: match[0] }
}

function parseScalar(value) {
  const v = value.trim()
  if (v === '') return ''
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"')
  }
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null' || v === '~') return null
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim()
    if (!inner) return []
    return splitList(inner).map(parseScalar)
  }
  return v
}

/** Split "a, 'b, c', d" on the commas that are not inside quotes. */
function splitList(inner) {
  const parts = []
  let current = ''
  let quote = null
  for (const ch of inner) {
    if (quote) {
      current += ch
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
    } else if (ch === ',') {
      parts.push(current)
      current = ''
    } else current += ch
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter((p) => p !== '')
}

export function parseYamlSubset(block) {
  const data = {}
  const pending = new Set()
  let listKey = null
  for (const line of block.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const item = listKey && line.match(/^\s*-\s+(.*)$/)
    if (item) {
      data[listKey].push(parseScalar(item[1]))
      pending.delete(listKey)
      continue
    }
    const pair = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!pair) continue
    const [, key, value] = pair
    if (value.trim() === '') {
      data[key] = []
      pending.add(key)
      listKey = key
    } else {
      data[key] = parseScalar(value)
      listKey = null
    }
  }
  // A key followed by nothing at all is an empty string, not an empty list.
  for (const key of pending) data[key] = ''
  return data
}

function formatScalar(value) {
  if (Array.isArray(value)) return `[${value.map(formatScalar).join(', ')}]`
  if (typeof value === 'string') {
    return /^[\w./@-][^:#\n]*$/.test(value) && !/^(true|false|null|-?\d+(\.\d+)?)$/.test(value)
      ? value
      : JSON.stringify(value)
  }
  return String(value)
}

/**
 * Set one front-matter field and leave everything else in the file untouched,
 * so a stamped translation shows a one-line diff.
 */
export function setFrontmatterField(source, key, value) {
  const text = String(source)
  const line = `${key}: ${formatScalar(value)}`
  const match = text.match(FENCE)
  if (!match) return `---\n${line}\n---\n\n${text}`
  const lines = match[1].split('\n')
  const at = lines.findIndex((l) => l.startsWith(`${key}:`))
  if (at === -1) lines.push(line)
  else lines[at] = line
  return `---\n${lines.join('\n')}\n---\n` + text.slice(match[0].length)
}
