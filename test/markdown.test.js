import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown, scanContainer, parseArgs } from '../src/markdown.js'
import { stringsFor } from '../src/i18n.js'

function render(src, extra = {}) {
  const warnings = []
  const result = renderMarkdown(src, {
    strings: stringsFor('en'),
    lang: 'en',
    resolveLink: (href) => ({ href, external: /^https?:/.test(href) }),
    resolveAsset: (href) => ({ url: '/' + href, size: { width: 800, height: 500 } }),
    glossary: new Map([['muse', { term: 'Muse', def: 'The design switch.' }], ['direction', { term: 'Design direction', def: 'A style.' }]]),
    warn: (m) => warnings.push(m),
    ...extra,
  })
  return { ...result, warnings }
}

test('scanContainer skips nested blocks and fenced code', () => {
  const src = ':::tabs\n@tab A\n```\n:::\n```\n:::note\nx\n:::\n:::\nafter'
  const c = scanContainer(src)
  assert.equal(c.name, 'tabs')
  assert.equal(c.closed, true)
  assert.equal(c.raw.endsWith(':::\n'), true)
  assert.equal(src.slice(c.raw.length), 'after')
})

test('parseArgs separates attributes from the title', () => {
  assert.deepEqual(parseArgs(' group=install title="Hello world" Some title'), {
    attrs: { group: 'install', title: 'Hello world' },
    title: 'Some title',
  })
})

test('callouts, including GitHub alerts', () => {
  const { html } = render(':::warning Careful\nBody **text**.\n:::\n\n> [!TIP]\n> An alert.')
  assert.match(html, /lm-callout-warning/)
  assert.match(html, /<p class="lm-callout-title">Careful<\/p>/)
  assert.match(html, /<strong>text<\/strong>/)
  assert.match(html, /lm-callout-tip[\s\S]*An alert\./)
})

test('headings get ids, custom ids and anchors, and feed the table of contents', () => {
  const { html, headings } = render('## Prérequis\n\n## Install {#setup}\n\n### Docker\n\n## Prérequis')
  assert.match(html, /<h2 id="prerequis">Prérequis<a class="lm-anchor"/)
  assert.match(html, /<h2 id="setup">Install/)
  assert.deepEqual(headings.map((h) => h.id), ['prerequis', 'setup', 'docker', 'prerequis-2'])
})

test('tabs render one panel per @tab, nested blocks intact', () => {
  const { html, warnings } = render(':::tabs group=install\n@tab Docker\n```bash\ndocker compose up\n```\n@tab Node.js\n:::note\nInside\n:::\n:::')
  assert.match(html, /data-group="install"/)
  assert.match(html, /data-tab="docker"[^>]*>Docker</)
  assert.match(html, /data-tab="node-js"/)
  assert.match(html, /role="tabpanel"[^>]*data-tab="node-js"[^>]*hidden>[\s\S]*lm-callout-note/)
  assert.deepEqual(warnings, [])
})

test('a tab can carry a fixed key, so translated labels stay in the same group', () => {
  const { html } = render(':::tabs group=view\n@tab Résultat {#result}\nA\n@tab Markdown\nB\n:::')
  assert.match(html, /data-tab="result">Résultat<\/button>/)
})

test('steps take their title from the leading bold text', () => {
  const { html } = render(':::steps id=first\n1. **Open Mocky.** The box cannot close.\n2. **Create** the account.\n   More detail.\n:::')
  assert.match(html, /data-steps="first"/)
  assert.match(html, /<p class="lm-step-title">Open Mocky<span/)
  assert.match(html, /The box cannot close\./)
  assert.match(html, /More detail\./)
  assert.match(html, /0 \/ 2/)
})

test('vars feed code blocks, inline code and text, above and below the block', () => {
  const { html } = render('Open {{host}}.\n\n```bash\ncurl -s {{host}}:{{port}}/api/health\n```\n\n`{{port}}`\n\n:::vars\nhost = localhost | Server address\nport = 8787 | Port\n:::')
  assert.match(html, /Open <var class="lm-var" data-var="host">localhost<\/var>/)
  assert.match(html, /<var class="lm-var" data-var="host">localhost<\/var>:<var class="lm-var" data-var="port">8787<\/var>\/api\/health/)
  assert.match(html, /<code><var class="lm-var" data-var="port">8787<\/var><\/code>/)
  assert.match(html, /data-var="host" data-default="localhost"/)
  assert.match(html, /Server address/)
})

test('unknown {{keys}} are left alone', () => {
  const { html } = render('Use {{nothing}} here.')
  assert.match(html, /Use \{\{nothing\}\} here\./)
})

test('hotspots place numbered dots and keep a readable list', () => {
  const { html } = render(':::hotspots src=assets/canvas.png alt="The canvas"\n- 72,4 **Navigation**: the bar at the top\n- 29.5, 10 **Toolbar**: the tools\n:::')
  assert.match(html, /<img src="\/assets\/canvas.png" alt="The canvas" width="800" height="500"/)
  assert.match(html, /style="left:72%;top:4%"/)
  assert.match(html, /style="left:29.5%;top:10%"/)
  assert.match(html, /lm-hs-count">1 \/ 2/)
  assert.match(html, /<li><strong class="lm-hs-li-t">Toolbar<\/strong>/)
})

test('quiz marks the right answer and keeps the explanation', () => {
  const { html, warnings } = render(':::quiz\nWho is admin?\n- Nobody\n- [x] The first account\n> Because it was first.\n:::')
  assert.match(html, /data-ok="0"[\s\S]*Nobody/)
  assert.match(html, /data-ok="1"[\s\S]*The first account/)
  assert.match(html, /Because it was first\./)
  assert.deepEqual(warnings, [])
  assert.equal(render(':::quiz\nQ?\n- a\n- b\n:::').warnings.length, 1)
})

test('glossary terms render as buttons and are collected', () => {
  const { html, terms, warnings } = render('Turn on [[Muse]] to build a [[design direction|direction]]. [[Unknown]]')
  assert.match(html, /<button type="button" class="lm-term" data-term="muse">Muse<\/button>/)
  assert.match(html, /data-term="direction">design direction</)
  assert.deepEqual([...terms].sort(), ['direction', 'muse'])
  assert.equal(warnings.length, 1)
})

test('code blocks: highlighting, title, marked lines, escaping', () => {
  const { html } = render('```bash title="install.sh" {2}\n# comment\nnpm install --save <pkg>\n```')
  assert.match(html, /lm-code-title">install.sh</)
  assert.match(html, /<span class="tok-c"># comment<\/span>/)
  assert.match(html, /<span class="lm-line lm-line-hl"><span class="tok-k">npm<\/span>/)
  assert.match(html, /&lt;pkg&gt;/)
})

test('images alone in a paragraph become figures; tables scroll', () => {
  const { html } = render('![A screen](assets/a.png "The caption")\n\n| a | b |\n|---|---|\n| 1 | 2 |')
  assert.match(html, /<figure class="lm-figure"><img src="\/assets\/a.png" alt="A screen" title="The caption" width="800" height="500"/)
  assert.match(html, /<figcaption>The caption<\/figcaption>/)
  assert.match(html, /<div class="lm-table"><table>/)
})

test('cards and widgets', () => {
  const { html } = render(':::cards cols=3\n- [Install](install.md) Get it running\n- [GitHub](https://github.com) Source\n:::\n\n:::widget presets source=styles\nFallback text.\n:::')
  assert.match(html, /--lm-cols:3/)
  assert.match(html, /<a class="lm-card" href="install.md">/)
  assert.match(html, /href="https:\/\/github.com" target="_blank"/)
  assert.match(html, /data-lumy-widget="presets" data-source="styles"><p>Fallback text\.<\/p>/)
})

test('":::name" in the middle of a line is text, not a block', () => {
  const { html, warnings } = render('`:::why` holds the reasoning, and so does :::note here.\n\nNext paragraph.')
  assert.deepEqual(warnings, [])
  assert.match(html, /<p><code>:::why<\/code> holds the reasoning, and so does :::note here\.<\/p>/)
  // …while a block right after a paragraph line still opens.
  assert.match(render('Some text\n:::tip\nInside\n:::').html, /<p>Some text<\/p>[\s\S]*lm-callout-tip/)
})

test('unknown and unclosed blocks warn instead of failing', () => {
  const { warnings } = render(':::bogus\nx\n:::\n\n:::note\nnever closed')
  assert.equal(warnings.length, 2)
})
