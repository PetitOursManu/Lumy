/**
 * A small syntax highlighter that runs at build time.
 *
 * Documentation code is mostly shell commands, configuration files and short
 * snippets, so a handful of regular-expression rules per language covers it,
 * and the reader's browser downloads no highlighting library at all. Unknown
 * languages are shown as plain text, which is always correct.
 */
import { esc } from './util.js'

const STR_D = String.raw`"(?:\\.|[^"\\\n])*"`
const STR_S = String.raw`'(?:\\.|[^'\\\n])*'`
const NUM = String.raw`\b\d[\d_]*(?:\.\d+)?\b`

const JS_KEYWORDS = 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|null|undefined|true|false|type|interface|enum|as|satisfies|void|yield|static|public|private|protected|readonly|delete'

const RULES = {
  bash: [
    ['c', String.raw`(?<=^|\s)#[^\n]*`],
    ['s', `${STR_D}|${STR_S}`],
    ['v', String.raw`\$\{[^}\n]+\}|\$[A-Za-z_]\w*`],
    ['f', String.raw`(?<=\s)--?[A-Za-z][\w-]*`],
    ['k', String.raw`(?<=(?:^|[|;&(]|&&|\|\||\$\s|sudo\s)[ \t]*)[A-Za-z_][\w.-]*`],
  ],
  js: [
    ['c', String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`],
    ['s', `${STR_D}|${STR_S}|` + '`(?:\\\\.|[^`\\\\])*`'],
    ['k', `\\b(?:${JS_KEYWORDS})\\b`],
    ['n', NUM],
    ['f', String.raw`\b[A-Za-z_$][\w$]*(?=\s*\()`],
  ],
  json: [
    ['c', String.raw`\/\/[^\n]*`],
    ['p', `${STR_D}(?=\\s*:)`],
    ['s', STR_D],
    ['k', String.raw`\b(?:true|false|null)\b`],
    ['n', String.raw`-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`],
  ],
  yaml: [
    ['c', String.raw`(?<=^|\s)#[^\n]*`],
    ['p', String.raw`(?<=^[ \t]*(?:-[ \t]+)?)[\w."'/-]+(?=[ \t]*:(?:[ \t]|$))`],
    ['s', `${STR_D}|${STR_S}`],
    ['k', String.raw`\b(?:true|false|null|yes|no|on|off)\b`],
    ['n', NUM],
  ],
  css: [
    ['c', String.raw`\/\*[\s\S]*?\*\/`],
    ['s', `${STR_D}|${STR_S}`],
    ['k', String.raw`@[\w-]+|!important`],
    ['v', String.raw`--[\w-]+`],
    ['p', String.raw`(?<=[{;]\s*)[a-z-]+(?=\s*:)`],
    ['n', String.raw`#[0-9a-fA-F]{3,8}\b|-?\b\d*\.?\d+(?:px|rem|em|%|s|ms|vh|vw|dvh|deg|fr)?\b`],
  ],
  html: [
    ['c', String.raw`<!--[\s\S]*?-->`],
    ['t', String.raw`(?<=<\/?)[A-Za-z][\w:.-]*`],
    ['a', String.raw`(?<=\s)[A-Za-z_:@][\w:.-]*(?=\s*=)`],
    ['s', String.raw`"[^"]*"|'[^']*'`],
  ],
  diff: [
    ['ins', String.raw`^\+[^\n]*`],
    ['del', String.raw`^-[^\n]*`],
    ['c', String.raw`^@@[^\n]*`],
  ],
  ini: [
    ['c', String.raw`^[ \t]*[#;][^\n]*`],
    ['k', String.raw`^[ \t]*\[[^\]\n]+\]`],
    ['p', String.raw`^[ \t]*(?:export[ \t]+)?[\w.-]+(?=[ \t]*=)`],
    ['s', `${STR_D}|${STR_S}`],
    ['v', String.raw`\$\{[^}\n]+\}|\$[A-Za-z_]\w*`],
  ],
  docker: [
    ['c', String.raw`^[ \t]*#[^\n]*`],
    ['k', String.raw`^[ \t]*(?:FROM|RUN|CMD|COPY|ADD|ENV|ARG|WORKDIR|EXPOSE|ENTRYPOINT|USER|VOLUME|LABEL|HEALTHCHECK|SHELL|ONBUILD|STOPSIGNAL)\b|\bAS\b`],
    ['s', `${STR_D}|${STR_S}`],
    ['v', String.raw`\$\{[^}\n]+\}|\$[A-Za-z_]\w*`],
    ['f', String.raw`(?<=\s)--[\w-]+`],
  ],
  python: [
    ['c', String.raw`#[^\n]*`],
    ['s', String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|` + `${STR_D}|${STR_S}`],
    ['k', String.raw`\b(?:def|class|return|if|elif|else|for|while|in|not|and|or|is|import|from|as|with|try|except|finally|raise|lambda|yield|pass|break|continue|None|True|False|async|await|global|nonlocal)\b`],
    ['n', NUM],
    ['f', String.raw`\b[A-Za-z_]\w*(?=\()`],
  ],
  sql: [
    ['c', String.raw`--[^\n]*|\/\*[\s\S]*?\*\/`],
    ['s', STR_S],
    ['k', String.raw`\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|ADD|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|PRIMARY|KEY|REFERENCES|DEFAULT|UNIQUE|select|from|where|insert|into|values|update|set|delete|create|table|index|drop|alter|add|join|left|right|inner|outer|on|and|or|not|null|as|order|by|group|having|limit|offset|primary|key|references|default|unique)\b`],
    ['n', NUM],
  ],
}

const ALIASES = {
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash', powershell: 'bash', ps1: 'bash',
  javascript: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js',
  jsonc: 'json', json5: 'json', yml: 'yaml', xml: 'html', svg: 'html', vue: 'html',
  env: 'ini', dotenv: 'ini', toml: 'ini', conf: 'ini', properties: 'ini',
  dockerfile: 'docker', py: 'python', patch: 'diff', scss: 'css', less: 'css',
}

const compiled = {}
function compile(lang) {
  if (compiled[lang]) return compiled[lang]
  const rules = RULES[lang]
  if (!rules) return null
  const source = rules.map(([, re], i) => `(?<g${i}>${re})`).join('|')
  compiled[lang] = { re: new RegExp(source, 'gm'), classes: rules.map(([cls]) => cls) }
  return compiled[lang]
}

export function languageOf(lang) {
  const key = String(lang || '').toLowerCase()
  return RULES[key] ? key : ALIASES[key] || null
}

/** Split a code string into [{ cls, text }] pieces. */
function tokenize(code, lang) {
  const spec = compile(languageOf(lang))
  if (!spec) return [{ cls: null, text: code }]
  const pieces = []
  let last = 0
  spec.re.lastIndex = 0
  let m
  while ((m = spec.re.exec(code))) {
    if (m[0] === '') {
      spec.re.lastIndex++
      continue
    }
    if (m.index > last) pieces.push({ cls: null, text: code.slice(last, m.index) })
    const i = Object.keys(m.groups).findIndex((k) => m.groups[k] !== undefined)
    pieces.push({ cls: spec.classes[i], text: m[0] })
    last = m.index + m[0].length
  }
  if (last < code.length) pieces.push({ cls: null, text: code.slice(last) })
  return pieces
}

/**
 * Highlight `code` and return one HTML string per line. Each line is
 * self-contained, so a line can be marked or numbered without breaking the
 * markup of a token that spans several lines.
 */
export function highlightLines(code, lang) {
  const lines = ['']
  for (const { cls, text } of tokenize(code, lang)) {
    text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push('')
      if (part) lines[lines.length - 1] += cls ? `<span class="tok-${cls}">${esc(part)}</span>` : esc(part)
    })
  }
  return lines
}
