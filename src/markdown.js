/**
 * Markdown to HTML, with Lumy's blocks.
 *
 * Plain Markdown (GitHub flavour) works as usual. On top of it:
 *
 *   :::note | :::tip | :::info | :::warning | :::danger | :::success   callouts
 *   :::why Title | :::details Title                                     collapsible blocks
 *   :::tabs group=name   with  @tab Label  separators                   tabs, remembered site-wide
 *   :::steps id=name     with an ordered list                           steps to tick
 *   :::vars              key = default | Label                          reader's own values
 *   :::hotspots src=img  with  - x,y **Title**: text                    annotated screenshot
 *   :::quiz              question, - [x] options, > explanation          quick check
 *   :::cards             - [Title](link) description                    link cards
 *   :::widget name       fallback content                               site-specific script
 *   [[term]] or [[text|term]]                                           glossary definition
 *   {{key}}                                                              a value from :::vars
 *   > [!NOTE] …                                                          GitHub alerts, as callouts
 *   ## Heading {#custom-id}                                              fixed heading id
 */
import { Marked } from 'marked'
import { esc, slugify, stripTags } from './util.js'
import { highlightLines, languageOf } from './highlight.js'
import { icon } from './icons.js'
import { fill } from './i18n.js'

const CALLOUTS = {
  note: { kind: 'note', icon: 'info' },
  info: { kind: 'info', icon: 'info' },
  tip: { kind: 'tip', icon: 'bulb' },
  warning: { kind: 'warning', icon: 'alert' },
  warn: { kind: 'warning', icon: 'alert' },
  caution: { kind: 'warning', icon: 'alert' },
  danger: { kind: 'danger', icon: 'octagon' },
  error: { kind: 'danger', icon: 'octagon' },
  success: { kind: 'success', icon: 'circleCheck' },
  check: { kind: 'success', icon: 'circleCheck' },
}

const ALERTS = { NOTE: 'note', TIP: 'tip', IMPORTANT: 'info', WARNING: 'warning', CAUTION: 'danger' }

export const DIRECTIVES = [...Object.keys(CALLOUTS), 'why', 'details', 'tabs', 'steps', 'vars', 'hotspots', 'quiz', 'cards', 'widget']

const CODE_LABELS = {
  bash: 'Terminal', js: 'JavaScript', json: 'JSON', yaml: 'YAML', css: 'CSS', html: 'HTML', diff: 'Diff',
  ini: 'Config', docker: 'Dockerfile', python: 'Python', sql: 'SQL',
}

/* ── Container scanning ───────────────────────────────────────────────── */

const OPEN = /^:::[ \t]*([A-Za-z][\w-]*)(.*)$/
const FENCE = /^(`{3,}|~{3,})/

/**
 * Find the extent of a ::: block starting at the top of `src`. Nested blocks
 * and fenced code are skipped over, so a ":::" line inside a code sample or an
 * inner block never closes the outer one. An unclosed block runs to the end.
 */
export function scanContainer(src) {
  const nl = src.indexOf('\n')
  const header = nl === -1 ? src : src.slice(0, nl)
  const m = header.match(OPEN)
  if (!m) return null
  if (nl === -1) return { name: m[1], rest: m[2], body: '', raw: src, closed: false }
  let depth = 1
  let fence = null
  let pos = nl + 1
  while (pos <= src.length) {
    const next = src.indexOf('\n', pos)
    const end = next === -1 ? src.length : next
    const line = src.slice(pos, end).trim()
    if (fence) {
      if (line.startsWith(fence) && /^[`~]+$/.test(line)) fence = null
    } else if (FENCE.test(line)) {
      fence = line.match(FENCE)[1]
    } else if (OPEN.test(line)) {
      depth++
    } else if (/^:::\s*$/.test(line)) {
      depth--
      if (depth === 0) {
        return {
          name: m[1],
          rest: m[2],
          body: src.slice(nl + 1, pos).replace(/\n$/, ''),
          raw: src.slice(0, next === -1 ? src.length : next + 1),
          closed: true,
        }
      }
    }
    if (next === -1) break
    pos = next + 1
  }
  return { name: m[1], rest: m[2], body: src.slice(nl + 1), raw: src, closed: false }
}

/** `key=value key="some value" Remaining title` → { attrs, title } */
export function parseArgs(rest) {
  const attrs = {}
  const title = String(rest || '')
    .replace(/([\w-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g, (_, k, a, b, c) => {
      attrs[k] = a ?? b ?? c
      return ''
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { attrs, title }
}

/**
 * Split `body` into top-level lines, telling each one whether it sits inside
 * fenced code or a nested block. Separators (@tab, list items…) only count at
 * the top level.
 */
function topLevelLines(body) {
  const out = []
  let fence = null
  let depth = 0
  for (const line of body.split('\n')) {
    const t = line.trim()
    const top = !fence && depth === 0
    out.push({ line, top })
    if (fence) {
      if (t.startsWith(fence) && /^[`~]+$/.test(t)) fence = null
    } else if (FENCE.test(t)) fence = t.match(FENCE)[1]
    else if (OPEN.test(t)) depth++
    else if (/^:::\s*$/.test(t) && depth > 0) depth--
  }
  return out
}

function dedent(lines) {
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length)
  const n = indents.length ? Math.min(...indents) : 0
  return lines.map((l) => l.slice(Math.min(n, l.match(/^[ \t]*/)[0].length))).join('\n')
}

/* ── The renderer ─────────────────────────────────────────────────────── */

/**
 * @param {string} source  Markdown without front matter.
 * @param {object} ctx     { strings, lang, resolveLink, resolveAsset, glossary, warn, pageKey }
 */
export function renderMarkdown(source, ctx) {
  const headings = []
  const terms = new Set()
  const ids = new Map()
  let uid = 0
  const nextId = (prefix) => `${prefix}${++uid}`
  const s = ctx.strings
  const warn = (message) => ctx.warn?.(message)

  // Values from :::vars blocks are collected first, so {{key}} works above
  // the block that declares it as well as below.
  const vars = {}
  for (const m of source.matchAll(/^:::[ \t]*vars\b[^\n]*\n([\s\S]*?)^:::[ \t]*$/gm)) {
    for (const v of parseVars(m[1])) vars[v.key] = v
  }

  function uniqueId(base) {
    const root = base || 'section'
    const n = ids.get(root) || 0
    ids.set(root, n + 1)
    return n ? `${root}-${n + 1}` : root
  }

  function varHtml(key) {
    return `<var class="lm-var" data-var="${esc(key)}">${esc(vars[key].value)}</var>`
  }

  /** Replace {{key}} in already-escaped HTML text. */
  function injectVars(html) {
    return html.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (m, k) => (vars[k] ? varHtml(k) : m))
  }

  const marked = new Marked({ gfm: true })

  const container = {
    name: 'lumyContainer',
    level: 'block',
    // Only a real line start counts: marked calls this with the first
    // character cut off, so "^" would also match in the middle of a line.
    start(src) {
      const m = src.match(/\n:::[ \t]*[A-Za-z]/)
      return m ? m.index + 1 : undefined
    },
    tokenizer(src) {
      if (!/^:::[ \t]*[A-Za-z]/.test(src)) return
      const c = scanContainer(src)
      if (!c) return
      const name = c.name.toLowerCase()
      if (!c.closed) warn(`":::${name}" is never closed; it runs to the end of the page.`)
      const { attrs, title } = parseArgs(c.rest)
      const token = { type: 'lumyContainer', raw: c.raw, name, attrs, title, titleTokens: title ? this.lexer.inlineTokens(title) : null }

      if (CALLOUTS[name] || name === 'why' || name === 'details') {
        token.tokens = this.lexer.blockTokens(c.body, [])
      } else if (name === 'tabs') {
        token.tabs = []
        let current = null
        let before = []
        for (const { line, top } of topLevelLines(c.body)) {
          const tab = top && line.match(/^@tab[ \t]+(.+)$/)
          if (tab) {
            current = { label: tab[1].trim(), lines: [] }
            token.tabs.push(current)
          } else if (current) current.lines.push(line)
          else before.push(line)
        }
        if (before.some((l) => l.trim())) warn('Text before the first "@tab" line in a :::tabs block is ignored.')
        for (const tab of token.tabs) {
          // "@tab Résultat {#result}": a fixed key keeps a tab group in step across languages.
          const fixed = tab.label.match(/\s*\{#([\w-]+)\}$/)
          if (fixed) tab.label = tab.label.slice(0, fixed.index)
          tab.key = fixed ? fixed[1] : slugify(tab.label) || `tab-${token.tabs.indexOf(tab) + 1}`
          tab.labelTokens = this.lexer.inlineTokens(tab.label)
          tab.tokens = this.lexer.blockTokens(tab.lines.join('\n'), [])
        }
        if (!token.tabs.length) warn('A :::tabs block has no "@tab Label" line.')
      } else if (name === 'steps') {
        token.steps = []
        let current = null
        for (const { line, top } of topLevelLines(c.body)) {
          const item = top && line.match(/^\d+[.)][ \t]+(.*)$/)
          if (item) {
            current = { first: item[1], lines: [] }
            token.steps.push(current)
          } else if (current) current.lines.push(line)
        }
        for (const step of token.steps) {
          const t = step.first.match(/^\*\*(.+?)\*\*[ \t]*[.:—–-]?[ \t]*(.*)$/)
          const rest = [t ? t[2] : step.first, dedent(step.lines)].join('\n').trim()
          step.titleTokens = t ? this.lexer.inlineTokens(t[1].replace(/[.:]$/, '')) : null
          step.tokens = this.lexer.blockTokens(rest, [])
        }
        if (!token.steps.length) warn('A :::steps block needs an ordered list ("1. …").')
      } else if (name === 'vars') {
        token.vars = parseVars(c.body)
      } else if (name === 'hotspots') {
        token.spots = []
        for (const line of c.body.split('\n')) {
          const m = line.match(/^\s*[-*][ \t]*(\d+(?:\.\d+)?)%?[ \t]*[,; ][ \t]*(\d+(?:\.\d+)?)%?[ \t]+(.*)$/)
          if (!m) {
            if (line.trim()) warn(`Hotspot line not understood: "${line.trim()}". Expected "- x,y **Title**: text".`)
            continue
          }
          const t = m[3].match(/^\*\*(.+?)\*\*[ \t]*[:—–-]?[ \t]*(.*)$/)
          token.spots.push({
            x: +m[1],
            y: +m[2],
            title: t ? t[1] : '',
            titleTokens: this.lexer.inlineTokens(t ? t[1] : ''),
            textTokens: this.lexer.inlineTokens(t ? t[2] : m[3]),
          })
        }
      } else if (name === 'quiz') {
        const question = []
        const explain = []
        const hint = []
        token.options = []
        for (const line of c.body.split('\n')) {
          const opt = line.match(/^\s*[-*][ \t]+(?:\[([ xX])\][ \t]+)?(.*)$/)
          if (opt) token.options.push({ ok: /x/i.test(opt[1] || ''), tokens: this.lexer.inlineTokens(opt[2]) })
          else if (/^\s*\?>/.test(line)) hint.push(line.replace(/^\s*\?>\s?/, ''))
          else if (/^\s*>/.test(line)) explain.push(line.replace(/^\s*>\s?/, ''))
          else if (!token.options.length) question.push(line)
        }
        token.question = this.lexer.blockTokens(question.join('\n').trim(), [])
        token.explain = explain.length ? this.lexer.blockTokens(explain.join('\n'), []) : null
        token.hint = hint.length ? this.lexer.blockTokens(hint.join('\n'), []) : null
        if (!token.options.some((o) => o.ok)) warn('A :::quiz has no correct answer; mark one with "- [x]".')
      } else if (name === 'cards') {
        token.cards = []
        for (const line of c.body.split('\n')) {
          const m = line.match(/^\s*[-*][ \t]+\[([^\]]+)\]\(([^)\s]+)\)[ \t]*[:—–-]?[ \t]*(.*)$/)
          if (m) token.cards.push({ titleTokens: this.lexer.inlineTokens(m[1]), href: m[2], descTokens: this.lexer.inlineTokens(m[3]) })
          else if (line.trim()) warn(`Card line not understood: "${line.trim()}". Expected "- [Title](link) description".`)
        }
      } else if (name === 'widget') {
        token.widget = title.split(/\s+/)[0] || ''
        token.tokens = this.lexer.blockTokens(c.body, [])
        if (!token.widget) warn('A :::widget block needs a name: ":::widget name".')
      } else {
        warn(`Unknown block ":::${name}". Known blocks: ${DIRECTIVES.join(', ')}.`)
        token.tokens = this.lexer.blockTokens(c.body, [])
      }
      return token
    },
    renderer(token) {
      const p = this.parser
      const inline = (tokens) => (tokens ? p.parseInline(tokens) : '')
      const block = (tokens) => (tokens ? p.parse(tokens) : '')
      const name = token.name

      if (CALLOUTS[name]) {
        const c = CALLOUTS[name]
        const title = token.titleTokens ? `<p class="lm-callout-title">${inline(token.titleTokens)}</p>` : ''
        return `<div class="lm-callout lm-callout-${c.kind}" role="note">${icon(c.icon)}<div class="lm-callout-body">${title}${block(token.tokens)}</div></div>\n`
      }
      if (name === 'why' || name === 'details') {
        const why = name === 'why'
        const eyebrow = why ? `<span class="lm-why-k">${esc(s.whyLabel)}</span>` : ''
        const title = token.titleTokens ? inline(token.titleTokens) : why ? '' : esc(s.viewSource)
        const open = token.attrs.open !== undefined ? ' open' : ''
        return `<details class="lm-collapse${why ? ' lm-why' : ''}"${open}><summary>${why ? icon('help', 'lm-why-i') : ''}<span class="lm-collapse-t">${eyebrow}${title}</span>${icon('down', 'lm-chev')}</summary><div class="lm-collapse-body"><div class="lm-collapse-inner">${block(token.tokens)}</div></div></details>\n`
      }
      if (name === 'tabs') {
        const id = nextId('lmt')
        const group = token.attrs.group ? ` data-group="${esc(token.attrs.group)}"` : ''
        const buttons = token.tabs
          .map((t, i) => `<button type="button" role="tab" id="${id}-t${i}" aria-controls="${id}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${esc(t.key)}">${inline(t.labelTokens)}</button>`)
          .join('')
        const panels = token.tabs
          .map((t, i) => `<div role="tabpanel" id="${id}-p${i}" aria-labelledby="${id}-t${i}" data-tab="${esc(t.key)}" tabindex="0"${i ? ' hidden' : ''}>${block(t.tokens)}</div>`)
          .join('')
        const hint = token.attrs.group ? `<span class="lm-tab-hint">${icon('pin')}${esc(s.tabRemembered)}</span>` : ''
        return `<div class="lm-tabs"${group}><div class="lm-tabs-top"><div class="lm-tablist" role="tablist"><span class="lm-tab-ind" aria-hidden="true"></span>${buttons}</div>${hint}</div><div class="lm-tabpanels">${panels}</div></div>\n`
      }
      if (name === 'steps') {
        const key = token.attrs.id || nextId('steps-')
        const total = token.steps.length
        const items = token.steps
          .map((step, i) => {
            const title = step.titleTokens ? `<p class="lm-step-title">${inline(step.titleTokens)}<span class="lm-step-done">${esc(s.stepDone)}</span></p>` : ''
            return `<li class="lm-step"><button class="lm-step-check" type="button" aria-pressed="false" aria-label="${esc(fill(s.stepToggle, { n: i + 1 }))}"><span class="lm-step-n">${i + 1}</span>${icon('check')}</button><div class="lm-step-body">${title}${block(step.tokens)}</div></li>`
          })
          .join('')
        return `<div class="lm-steps" data-steps="${esc(key)}"><div class="lm-steps-top"><span>${esc(s.stepsHint)}</span><div class="lm-steps-bar"><i></i></div><span class="lm-steps-count">0 / ${total}</span><button class="lm-linkish" type="button" data-lm="steps-reset">${esc(s.stepsReset)}</button></div><ol class="lm-steps-list">${items}</ol></div>\n`
      }
      if (name === 'vars') {
        const fields = token.vars
          .map((v) => {
            const id = nextId(`lmv-${v.key}-`)
            const small = v.value.length <= 6 ? ' lm-field-small' : ''
            return `<label class="lm-field${small}" for="${id}">${esc(v.label)}<input id="${id}" data-var="${esc(v.key)}" data-default="${esc(v.value)}" value="${esc(v.value)}" autocomplete="off" spellcheck="false"></label>`
          })
          .join('')
        return `<div class="lm-vars"><div class="lm-vars-head">${icon('sliders')}<strong>${esc(token.title || s.yourValues)}</strong><span>${esc(s.yourValuesHint)}</span></div><div class="lm-vars-fields">${fields}<button class="lm-btn lm-btn-sm" type="button" data-lm="vars-reset">${esc(s.reset)}</button></div></div>\n`
      }
      if (name === 'hotspots') {
        const src = token.attrs.src || ''
        const asset = ctx.resolveAsset(src)
        if (!src) warn('A :::hotspots block needs an image: ":::hotspots src=path/to/image.png".')
        const size = asset.size ? ` width="${asset.size.width}" height="${asset.size.height}"` : ''
        const alt = token.attrs.alt || token.title || ''
        const n = token.spots.length
        const dots = token.spots
          .map((sp, i) => `<button class="lm-hs-dot" type="button" data-i="${i}" style="left:${sp.x}%;top:${sp.y}%" aria-label="${i + 1}. ${esc(stripTags(inline(sp.titleTokens)))}"${i === 0 ? ' aria-pressed="true"' : ''}>${i + 1}</button>`)
          .join('')
        const list = token.spots
          .map((sp) => `<li><strong class="lm-hs-li-t">${inline(sp.titleTokens)}</strong> <span class="lm-hs-li-x">${inline(sp.textTokens)}</span></li>`)
          .join('')
        const first = token.spots[0]
        const panel = first
          ? `<div class="lm-hs-panel" aria-live="polite"><div class="lm-hs-head"><span class="lm-hs-num">1</span><span class="lm-hs-title">${inline(first.titleTokens)}</span><span class="lm-hs-count">1 / ${n}</span></div><div class="lm-hs-text">${inline(first.textTokens)}</div><div class="lm-hs-nav"><button class="lm-btn lm-btn-sm" type="button" data-lm="hs-prev">${icon('left')}${esc(s.tourPrev)}</button><button class="lm-btn lm-btn-sm lm-btn-primary" type="button" data-lm="hs-next">${esc(s.tourNext)}${icon('right')}</button></div></div>`
          : ''
        return `<figure class="lm-hs"><div class="lm-hs-stage"><img src="${esc(asset.url)}" alt="${esc(alt)}"${size} loading="lazy" decoding="async">${dots}<button class="lm-hs-zoom" type="button" data-lm="zoom">${icon('expand')}${esc(s.enlarge)}</button></div>${panel}<ol class="lm-hs-list">${list}</ol></figure>\n`
      }
      if (name === 'quiz') {
        const opts = token.options.map((o) => `<button class="lm-quiz-opt" type="button" data-ok="${o.ok ? 1 : 0}"><span class="lm-quiz-mark" aria-hidden="true"></span><span>${inline(o.tokens)}</span></button>`).join('')
        const ok = `<div class="lm-quiz-fb lm-quiz-ok" hidden><div><strong>${esc(s.quizOk)}</strong> ${block(token.explain)}</div></div>`
        const bad = `<div class="lm-quiz-fb lm-quiz-bad" hidden><div>${token.hint ? block(token.hint) : `<p>${esc(s.quizBad)}</p>`}</div></div>`
        return `<div class="lm-quiz"><div class="lm-quiz-k">${icon('help')}${esc(token.title || s.quizLabel)}</div><div class="lm-quiz-q">${block(token.question)}</div><div class="lm-quiz-opts">${opts}</div>${ok}${bad}</div>\n`
      }
      if (name === 'cards') {
        const cols = Math.min(4, Math.max(1, Number(token.attrs.cols) || 2))
        const cards = token.cards
          .map((c) => {
            const link = ctx.resolveLink(c.href)
            const ext = link.external ? ' target="_blank" rel="noopener"' : ''
            return `<a class="lm-card" href="${esc(link.href)}"${ext}><span class="lm-card-t">${inline(c.titleTokens)}</span>${c.descTokens?.length ? `<span class="lm-card-d">${inline(c.descTokens)}</span>` : ''}${icon(link.external ? 'external' : 'arrow', 'lm-card-i')}</a>`
          })
          .join('')
        return `<div class="lm-cards" style="--lm-cols:${cols}">${cards}</div>\n`
      }
      if (name === 'widget') {
        const data = Object.entries(token.attrs)
          .map(([k, v]) => ` data-${esc(k.toLowerCase())}="${esc(v)}"`)
          .join('')
        return `<div class="lm-widget" data-lumy-widget="${esc(token.widget)}"${data}>${block(token.tokens)}</div>\n`
      }
      return `<div class="lm-container lm-container-${esc(name)}">${block(token.tokens)}</div>\n`
    },
  }

  const alert = {
    name: 'lumyAlert',
    level: 'block',
    start(src) {
      const m = src.match(/\n>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i)
      return m ? m.index + 1 : undefined
    },
    tokenizer(src) {
      const m = src.match(/^>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*(?:\n>[^\n]*)*(?:\n|$)/i)
      if (!m) return
      const lines = m[0].replace(/\n$/, '').split('\n').map((l) => l.replace(/^>[ \t]?/, ''))
      const first = lines.shift().replace(/^\[![A-Z]+\][ \t]*/i, '')
      const body = [first, ...lines].join('\n').trim()
      return { type: 'lumyAlert', raw: m[0], kind: ALERTS[m[1].toUpperCase()], tokens: this.lexer.blockTokens(body, []) }
    },
    renderer(token) {
      const c = CALLOUTS[token.kind]
      return `<div class="lm-callout lm-callout-${c.kind}" role="note">${icon(c.icon)}<div class="lm-callout-body">${this.parser.parse(token.tokens)}</div></div>\n`
    },
  }

  const term = {
    name: 'lumyTerm',
    level: 'inline',
    start(src) {
      const i = src.indexOf('[[')
      return i === -1 ? undefined : i
    },
    tokenizer(src) {
      const m = src.match(/^\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/)
      if (!m) return
      const label = m[1].trim()
      const key = slugify(m[2] ? m[2] : m[1])
      return { type: 'lumyTerm', raw: m[0], label, key }
    },
    renderer(token) {
      const entry = ctx.glossary?.get(token.key)
      if (!entry) {
        warn(`Glossary term "${token.key}" is not defined in glossary.md.`)
        return esc(token.label)
      }
      terms.add(token.key)
      return `<button type="button" class="lm-term" data-term="${esc(token.key)}">${esc(token.label)}</button>`
    },
  }

  const variable = {
    name: 'lumyVar',
    level: 'inline',
    start(src) {
      const i = src.indexOf('{{')
      return i === -1 ? undefined : i
    },
    tokenizer(src) {
      const m = src.match(/^\{\{\s*([\w-]+)\s*\}\}/)
      if (!m || !vars[m[1]]) return
      return { type: 'lumyVar', raw: m[0], key: m[1] }
    },
    renderer(token) {
      return varHtml(token.key)
    },
  }

  marked.use({
    extensions: [container, alert, term, variable],
    renderer: {
      heading({ tokens, depth }) {
        let html = this.parser.parseInline(tokens)
        let custom = null
        html = html.replace(/\s*\{#([\w-]+)\}\s*$/, (_, id) => {
          custom = id
          return ''
        })
        const text = stripTags(html)
        const id = uniqueId(custom || slugify(text))
        if (depth === 2 || depth === 3) headings.push({ depth, id, text })
        const anchor = depth >= 2 && depth <= 4 ? `<a class="lm-anchor" href="#${id}" aria-label="${esc(s.linkToSection)}">#</a>` : ''
        return `<h${depth} id="${id}">${html}${anchor}</h${depth}>\n`
      },
      code({ text, lang }) {
        const info = String(lang || '').trim()
        const language = info.split(/\s+/)[0] || ''
        const title = info.match(/title=(?:"([^"]*)"|'([^']*)'|(\S+))/)
        const titleText = title ? title[1] ?? title[2] ?? title[3] : ''
        const marks = new Set()
        const range = info.match(/\{([\d,\s-]+)\}/)
        if (range) {
          for (const part of range[1].split(',')) {
            const [a, b] = part.split('-').map((n) => parseInt(n, 10))
            for (let i = a; i <= (b || a); i++) marks.add(i)
          }
        }
        // {{key}} survives highlighting as a private-use marker, then becomes a <var>.
        const code = text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (m, k) => (vars[k] ? `${k}` : m))
        const lines = highlightLines(code, language).map((l, i) =>
          `<span class="lm-line${marks.has(i + 1) ? ' lm-line-hl' : ''}">${l.replace(/([\w-]+)/g, (_, k) => varHtml(k))}</span>`,
        )
        const known = languageOf(language)
        const label = titleText || CODE_LABELS[known] || language.toUpperCase()
        return `<div class="lm-code" data-lang="${esc(known || language)}"><div class="lm-code-head"><span class="lm-code-title">${esc(label)}</span><button class="lm-copy" type="button" aria-label="${esc(s.copy)}">${icon('copy', 'lm-i-copy')}${icon('check', 'lm-i-done')}<span>${esc(s.copy)}</span></button></div><pre><code>${lines.join('')}</code></pre></div>\n`
      },
      codespan({ text }) {
        // marked has already escaped the text.
        return `<code>${injectVars(text)}</code>`
      },
      link({ href, title, tokens }) {
        const link = ctx.resolveLink(href)
        const t = title ? ` title="${esc(title)}"` : ''
        const ext = link.external ? ' target="_blank" rel="noopener"' : ''
        return `<a href="${esc(link.href)}"${t}${ext}>${this.parser.parseInline(tokens)}</a>`
      },
      image({ href, title, text }) {
        const asset = ctx.resolveAsset(href)
        const size = asset.size ? ` width="${asset.size.width}" height="${asset.size.height}"` : ''
        const t = title ? ` title="${esc(title)}"` : ''
        return `<img src="${esc(asset.url)}" alt="${esc(text)}"${t}${size} loading="lazy" decoding="async">`
      },
      paragraph({ tokens }) {
        const meaningful = tokens.filter((t) => !(t.type === 'text' && !t.text.trim()) && t.type !== 'br')
        if (meaningful.length === 1 && meaningful[0].type === 'image') {
          const img = meaningful[0]
          const caption = img.title ? `<figcaption>${esc(img.title)}</figcaption>` : ''
          return `<figure class="lm-figure">${this.parser.parseInline([img])}${caption}</figure>\n`
        }
        return `<p>${this.parser.parseInline(tokens)}</p>\n`
      },
      table(token) {
        const align = (a) => (a ? ` style="text-align:${a}"` : '')
        const head = token.header.map((c) => `<th${align(c.align)}>${this.parser.parseInline(c.tokens)}</th>`).join('')
        const rows = token.rows
          .map((row) => `<tr>${row.map((c) => `<td${align(c.align)}>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`)
          .join('')
        return `<div class="lm-table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`
      },
    },
  })

  const html = marked.parse(source)
  return { html, headings, terms, vars }
}

function parseVars(body) {
  const out = []
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([\w-]+)\s*[=:]\s*([^|]*?)\s*(?:\|\s*(.*?))?\s*$/)
    if (m) out.push({ key: m[1], value: m[2], label: m[3] || m[1] })
  }
  return out
}
