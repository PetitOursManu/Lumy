import { createHash } from 'node:crypto'
import { readdir, stat, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import { join, dirname, relative, sep } from 'node:path'

/** HTML-escape text for element content and attribute values. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

/** Remove tags and collapse whitespace. Good enough for search text and descriptions. */
export function stripTags(html) {
  return String(html ?? '')
    .replace(/<(script|style|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A heading id. Accents are folded rather than dropped, so "Prérequis" becomes
 * "prerequis" and not "prrequis", and the result stays readable in a URL.
 */
export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[’'`"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Short, stable content hash. */
export function hash(text, length = 10) {
  return createHash('sha256').update(text).digest('hex').slice(0, length)
}

/** Line endings normalised, so a file hashes the same on Windows and Linux. */
export function normalizeEol(text) {
  return String(text).replace(/\r\n?/g, '\n')
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
export async function walk(dir, { skip = () => false } = {}) {
  const out = []
  async function visit(current) {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      const rel = toPosix(relative(dir, full))
      if (skip(rel, entry)) continue
      if (entry.isDirectory()) await visit(full)
      else if (entry.isFile()) out.push(rel)
    }
  }
  await visit(dir)
  return out.sort()
}

export function toPosix(p) {
  return p.split(sep).join('/')
}

export async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

export async function writeFileSafe(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

export async function copyFileSafe(from, to) {
  await mkdir(dirname(to), { recursive: true })
  await copyFile(from, to)
}

export async function readText(path) {
  return normalizeEol(await readFile(path, 'utf8'))
}

/** Pick the string for `lang` out of a value that may be a plain string or a { lang: text } map. */
export function pickLang(value, lang, fallbackLang) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return value[lang] ?? value[fallbackLang] ?? Object.values(value)[0] ?? ''
}

/** Minutes to read `text`, at a pace that suits technical prose. */
export function readingMinutes(text) {
  const words = String(text).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

/* ── Colour ─────────────────────────────────────────────────────────────── */

export function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function rgbToHsl([r, g, b]) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h, s, l]
}

function hslToHex([h, s, l]) {
  const f = (n) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * The dark-theme version of a brand colour when the site gives only one: the
 * same hue, lifted until it reads on a near-black ground.
 */
export function liftForDark(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [h, s, l] = rgbToHsl(rgb)
  return hslToHex([h, Math.min(1, s * 1.05), Math.max(l, 0.62)])
}

/** Relative luminance, for choosing black or white text on a colour. */
export function luminance(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
