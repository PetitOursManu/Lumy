/**
 * The reader assistant: answers a question from the documentation itself.
 *
 * It finds the sections most likely to hold the answer in the site's search
 * index, gives only those to the model, and asks it to cite them. Readers get
 * the sources as links, first, then the answer as it is written.
 */
import { chat } from './providers.js'
import { LANGUAGE_NAMES } from './i18n.js'

const STOP = new Set(
  (
    'a an and are as at be by can do does for from how i if in is it its my of on or so that the this to was what when where which who why will with you your ' +
    'au aux avec ce ces comment dans de des du elle en est et il je la le les leur mais mon ne nous on ou où par pas pour qu que quel quelle qui sa se ses son sur ta te tu un une vos votre vous y ' +
    'como con cual de del el en es la las lo los para por que qué se un una y ' +
    'das der die ein eine es für ich ist mit nicht und wie wo zu ' +
    'che come con del di e il in la le per un una ' +
    'como da de do em para por que um uma'
  ).split(' '),
)

const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function terms(text) {
  return [...new Set(norm(text).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)))]
}

/** Loose stem: enough to match "translations" with "translation", "traduites" with "traduire". */
const stem = (w) => (w.length > 5 ? w.slice(0, Math.max(4, w.length - 2)) : w)

/**
 * The sections that best match `question`, from a search index
 * ({ items: [{ k, p, h, u, t }] }). Sections of the page the reader is on
 * weigh a little more: "how do I do this?" usually means "this" on that page.
 */
export function retrieve(items, question, { pageUrl = '', limit = 6 } = {}) {
  const words = terms(question).map(stem)
  if (!words.length) return []
  const docs = items.map((it) => ({ it, head: norm(`${it.p} ${it.h}`), body: norm(it.t) }))
  const df = new Map(words.map((w) => [w, docs.filter((d) => d.head.includes(w) || d.body.includes(w)).length]))
  const n = docs.length || 1
  const scored = []
  for (const d of docs) {
    let score = 0
    let matched = 0
    for (const w of words) {
      const inHead = d.head.includes(w)
      const inBody = d.body.includes(w)
      if (!inHead && !inBody) continue
      matched++
      const idf = Math.log(1 + n / (1 + df.get(w)))
      score += idf * ((inHead ? 3 : 0) + (inBody ? 1 : 0))
    }
    if (!score) continue
    score *= 0.5 + matched / words.length
    if (pageUrl && d.it.u.split('#')[0] === pageUrl) score *= 1.4
    if (d.it.k === 'g') score *= 0.8
    scored.push({ score, it: d.it })
  }
  scored.sort((a, b) => b.score - a.score)
  const seen = new Set()
  const out = []
  for (const { it } of scored) {
    if (seen.has(it.u)) continue
    seen.add(it.u)
    out.push(it)
    if (out.length >= limit) break
  }
  return out
}

export function buildMessages({ title, lang, question, excerpts, history = [] }) {
  const language = LANGUAGE_NAMES[lang] || lang
  const system = [
    `You are the documentation assistant of "${title}". Answer the reader's question using only the numbered excerpts you are given.`,
    '- If the excerpts do not contain the answer, say so in one sentence and point to the closest page. Never invent options, commands or values.',
    `- Answer in ${language}. Be brief and concrete: steps as a numbered list, commands in fenced code blocks.`,
    '- Cite the excerpts you used with their numbers in square brackets, such as [1] or [2][3].',
  ].join('\n')
  const context = excerpts
    .map((e, i) => `[${i + 1}] ${e.p}${e.h ? ' › ' + e.h : ''}\n${e.t}`)
    .join('\n\n')
  const past = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
  return [
    { role: 'system', content: system },
    ...past,
    { role: 'user', content: `Excerpts:\n\n${context || '(none found)'}\n\nQuestion: ${question}` },
  ]
}

/**
 * Answer on `res` as newline-delimited JSON:
 *   {"type":"sources","sources":[{"n":1,"title":"…","url":"…"}]}
 *   {"type":"text","text":"…"}   (repeated)
 *   {"type":"done"}  or  {"type":"error","message":"…"}
 */
export async function answer(res, { settings, index, question, history, lang, pageUrl, title }) {
  const excerpts = retrieve(index?.items || [], question, { pageUrl })
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' })
  const send = (obj) => res.write(JSON.stringify(obj) + '\n')
  send({ type: 'sources', sources: excerpts.map((e, i) => ({ n: i + 1, title: e.h ? `${e.p} › ${e.h}` : e.p, url: e.u })) })
  const aborted = new AbortController()
  res.on('close', () => aborted.abort())
  try {
    await chat(settings, buildMessages({ title, lang, question, excerpts, history }), {
      onText: (text) => send({ type: 'text', text }),
      signal: aborted.signal,
    })
    send({ type: 'done' })
  } catch (err) {
    if (!aborted.signal.aborted) send({ type: 'error', message: err.message })
  }
  res.end()
}
