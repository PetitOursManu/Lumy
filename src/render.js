/**
 * The HTML around a page: header, sidebar, table of contents, dialogs.
 *
 * Everything a reader needs is in the markup, so a page reads fine with
 * JavaScript off; lumy.js only adds behaviour and motion on top.
 */
import { esc, pickLang, luminance } from './util.js'
import { icon, sprite } from './icons.js'
import { fill, RTL } from './i18n.js'

function formatDate(iso, lang) {
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

function onColor(hex) {
  return luminance(hex) > 0.45 ? '#0b0b0d' : '#ffffff'
}

/** Inline script in <head>: theme before first paint, so a dark page never flashes white. */
const HEAD_SCRIPT =
  "(function(){var d=document.documentElement;d.classList.add('lm-js');try{var t=JSON.parse(localStorage.getItem('lumy.theme'));if(t==='dark'||t==='light')d.setAttribute('data-theme',t)}catch(e){}})()"

export function renderPage(v) {
  const { config, lang, s } = v
  const def = config.defaultLanguage
  const L = (value) => pickLang(value, lang, def)
  const multiLang = config.languages.length > 1
  const title = v.isHome ? config.title : `${v.page.title} — ${config.title}`
  const description = v.page.description || config.description || ''
  const theme = config.theme
  const absolute = (path) => (config.url ? config.url + path : path)

  const alternates = multiLang
    ? v.alternates.map((a) => `<link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(absolute(a.url))}">`).join('\n')
    : ''

  const head = `<!doctype html>
<html lang="${esc(lang)}" dir="${RTL.has(lang) ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)">
<meta name="generator" content="Lumy">
${config.url ? `<link rel="canonical" href="${esc(absolute(v.page.url))}">` : ''}
${alternates}
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(config.title)}">
<meta property="og:title" content="${esc(v.page.title)}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ''}
${v.assets.favicon ? `<link rel="icon" href="${esc(v.assets.favicon)}">` : ''}
<link rel="preload" href="${esc(v.assets.fontSans)}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${esc(v.assets.css)}">
${v.assets.styles.map((href) => `<link rel="stylesheet" href="${esc(href)}">`).join('\n')}
<style>:root{--lm-brand-l:${theme.brand};--lm-brand-d:${theme.brandDark};--lm-on-brand-l:${onColor(theme.brand)};--lm-on-brand-d:${onColor(theme.brandDark)};--lm-radius:${Number(theme.radius) || 12}px}</style>
<script>${HEAD_SCRIPT}</script>
<script defer src="${esc(v.assets.js)}"></script>
${v.assets.scripts.map((src) => `<script defer src="${esc(src)}"></script>`).join('\n')}
</head>`

  /* ── Header ───────────────────────────────────────────────────────── */
  const brand = `<a class="lm-brand" href="${esc(v.homeUrl)}">${v.assets.logo ? `<img src="${esc(v.assets.logo)}" alt="" width="24" height="24">` : ''}<span class="lm-brand-t">${esc(config.title)}</span>${config.brandSuffix !== false ? `<span class="lm-brand-sep">/</span><span class="lm-brand-s">${esc(L(config.brandSuffix) || 'Docs')}</span>` : ''}</a>`
  const links = (config.links || [])
    .map((l) => `<a href="${esc(v.resolveHref(l.href))}"${/^https?:/.test(l.href) ? ' target="_blank" rel="noopener"' : ''}>${esc(L(l.label))}</a>`)
    .join('')
  const langMenu = multiLang
    ? `<div class="lm-menu-wrap"><button class="lm-icon-btn" type="button" data-lm="menu" aria-haspopup="true" aria-expanded="false" aria-label="${esc(s.language)}">${icon('globe')}<span class="lm-lang-code">${esc(lang.toUpperCase())}</span></button><div class="lm-menu" role="menu" hidden>${v.alternates
        .map((a) => `<a role="menuitemradio" aria-checked="${a.lang === lang}" href="${esc(a.url)}" hreflang="${esc(a.lang)}" lang="${esc(a.lang)}" data-lm="lang">${esc(a.label)}${icon('check', 'lm-check')}</a>`)
        .join('')}</div></div>`
    : ''
  const header = `<header class="lm-top">
<button class="lm-icon-btn lm-menu-btn" type="button" data-lm="drawer" aria-label="${esc(s.menu)}" aria-controls="lm-side" aria-expanded="false">${icon('menu')}</button>
${brand}
${config.version ? `<span class="lm-ver">${esc(config.version)}</span>` : ''}
${links ? `<nav class="lm-topnav">${links}</nav>` : ''}
<span class="lm-grow"></span>
${config.search ? `<button class="lm-search-btn" type="button" data-lm="search" aria-label="${esc(s.search)}">${icon('search')}<span class="lm-search-ph">${esc(s.searchPlaceholder)}</span><kbd class="lm-kbd-k">Ctrl K</kbd></button>` : ''}
${config.assistant.enabled ? `<button class="lm-icon-btn lm-ai-btn" type="button" data-lm="ask" aria-label="${esc(s.askAi)}">${icon('sparkles')}<span class="lm-ai-lbl">${esc(s.askAi)}</span></button>` : ''}
${langMenu}
${config.server ? '<div class="lm-menu-wrap lm-account" id="lm-account" hidden></div>' : ''}
<button class="lm-icon-btn lm-theme-btn" type="button" data-lm="theme" aria-label="${esc(s.theme)}">${icon('moon', 'lm-i-moon')}${icon('sun', 'lm-i-sun')}</button>
${config.github ? `<a class="lm-icon-btn lm-gh" href="${esc(config.github)}" target="_blank" rel="noopener" aria-label="GitHub">${icon('github')}</a>` : ''}
</header>`

  /* ── Sidebar ──────────────────────────────────────────────────────── */
  const audiences = config.audiences.length
    ? `<div class="lm-aud"><span class="lm-aud-label">${esc(s.audienceLabel)}</span><div class="lm-seg" role="group"><span class="lm-seg-ind" aria-hidden="true"></span><button type="button" data-lm="aud" data-aud="all" aria-pressed="true">${esc(s.audienceAll)}</button>${config.audiences
        .map((a) => `<button type="button" data-lm="aud" data-aud="${esc(a.id)}" aria-pressed="false">${esc(L(a.label))}</button>`)
        .join('')}</div></div>`
    : ''
  const groups = v.nav
    .map((g) => {
      const items = g.items
        .map((item) => {
          if (item.link) return `<li><a class="lm-nav-a" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.label)}${icon('external', 'lm-nav-ext')}</a></li>`
          const current = item.current ? ' class="lm-nav-a is-current" aria-current="page"' : ' class="lm-nav-a"'
          const aud = item.audience.length ? ` data-aud="${esc(item.audience.join(' '))}"` : ''
          const badge = item.badge ? `<span class="lm-badge">${esc(item.badge)}</span>` : ''
          return `<li${aud}><a${current} href="${esc(item.url)}">${esc(item.label)}${badge}</a></li>`
        })
        .join('')
      return `<div class="lm-group">${g.label ? `<p class="lm-group-t">${esc(g.label)}</p>` : ''}<ul>${items}</ul></div>`
    })
    .join('')
  const sidebar = `<aside class="lm-side" id="lm-side" aria-label="${esc(s.menu)}">
<div class="lm-side-head">${brand}<button class="lm-icon-btn" type="button" data-lm="drawer-close" aria-label="${esc(s.close)}">${icon('x')}</button></div>
${audiences}
<nav class="lm-nav">${groups}</nav>
<p class="lm-side-foot">${fill(esc(s.poweredBy), { lumy: '<a href="https://github.com/PetitOursManu/Lumy" target="_blank" rel="noopener">Lumy</a>' })}</p>
</aside>`

  /* ── Article ──────────────────────────────────────────────────────── */
  const pageMenu = [
    `<button type="button" role="menuitem" data-lm="copy-page">${icon('copy')}<span>${esc(s.copyMarkdown)}<span class="lm-mi-sub">${esc(s.copyMarkdownSub)}</span></span></button>`,
    `<button type="button" role="menuitem" data-lm="source">${icon('file')}<span>${esc(s.viewSource)}<span class="lm-mi-sub">${esc(s.viewSourceSub)}</span></span></button>`,
    config.assistant.enabled ? `<button type="button" role="menuitem" data-lm="ask">${icon('sparkles')}<span>${esc(s.askAi)}<span class="lm-mi-sub">${esc(s.askAiSub)}</span></span></button>` : '',
    config.llms || config.mcp.enabled ? `<button type="button" role="menuitem" data-lm="ai-tools">${icon('plug')}<span>${esc(s.aiTools)}<span class="lm-mi-sub">${esc(s.aiToolsSub)}</span></span></button>` : '',
  ].join('')
  const meta = [
    `<span class="lm-meta">${icon('clock')}${esc(fill(s.readingTime, { n: v.readingMinutes }))}</span>`,
    v.page.updated ? `<span class="lm-meta">${esc(fill(s.updated, { date: formatDate(v.page.updated, lang) }))}</span>` : '',
  ].join('')
  const actions = `<div class="lm-page-actions"><button class="lm-btn lm-btn-sm" type="button" data-lm="copy-page">${icon('copy')}<span>${esc(s.copyPage)}</span></button><div class="lm-menu-wrap"><button class="lm-btn lm-btn-sm lm-btn-caret" type="button" data-lm="menu" aria-haspopup="true" aria-expanded="false" aria-label="${esc(s.copyPage)}">${icon('down')}</button><div class="lm-menu" role="menu" hidden>${pageMenu}</div></div></div>`

  const sourceLabel = config.languages.find((l) => l.code === v.contentLang)?.label || v.contentLang
  const defLabel = config.languages.find((l) => l.code === def)?.label || def
  let banner = ''
  if (v.fallback) {
    banner = `<div class="lm-banner" role="note">${icon('languages')}<div>${esc(fill(s.untranslated, { lang: sourceLabel }))}</div></div>`
  } else if (v.page.translation === 'outdated') {
    banner = `<div class="lm-banner" role="note">${icon('languages')}<div>${esc(fill(s.outdated, { lang: defLabel }))}</div><a class="lm-btn lm-btn-sm" href="${esc(v.defaultUrl)}" hreflang="${esc(def)}">${esc(fill(s.outdatedAction, { lang: defLabel }))}</a></div>`
  }

  const feedback = config.feedback.enabled
    ? `<div class="lm-fb" data-endpoint="${esc(config.feedback.endpoint || '')}"><span class="lm-fb-q">${esc(s.helpful)}</span><div class="lm-fb-btns"><button class="lm-btn lm-btn-sm" type="button" data-lm="fb" data-value="yes">${icon('thumbUp')}${esc(s.yes)}</button><button class="lm-btn lm-btn-sm" type="button" data-lm="fb" data-value="no">${icon('thumbDown')}${esc(s.no)}</button></div><form class="lm-fb-form" hidden><label for="lm-fb-text">${esc(s.feedbackMissing)}</label><textarea id="lm-fb-text" rows="3"></textarea><button class="lm-btn lm-btn-sm lm-btn-primary" type="submit">${esc(s.feedbackSend)}</button></form><p class="lm-fb-thanks" hidden>${esc(s.feedbackThanks)}</p></div>`
    : ''
  const editRow = [
    v.page.editUrl ? `<a href="${esc(v.page.editUrl)}" target="_blank" rel="noopener">${icon('pencil')}${esc(s.editPage)}</a>` : '',
    config.issuesUrl ? `<a href="${esc(config.issuesUrl)}" target="_blank" rel="noopener">${icon('flag')}${esc(s.reportIssue)}</a>` : '',
  ].join('')
  const pager =
    v.prev || v.next
      ? `<nav class="lm-pager" aria-label="${esc(s.previous)} / ${esc(s.next)}">${v.prev ? `<a class="lm-pager-a" href="${esc(v.prev.url)}" rel="prev"><small>${icon('left')}${esc(s.previous)}</small><strong>${esc(v.prev.title)}</strong></a>` : '<span></span>'}${v.next ? `<a class="lm-pager-a lm-pager-next" href="${esc(v.next.url)}" rel="next"><small>${esc(s.next)}${icon('right')}</small><strong>${esc(v.next.title)}</strong></a>` : ''}</nav>`
      : ''

  const article = `<article class="lm-doc" lang="${esc(v.contentLang)}">
${v.group ? `<div class="lm-eyebrow">${esc(v.group)}</div>` : ''}
<h1>${esc(v.page.title)}</h1>
${v.page.description ? `<p class="lm-lead">${esc(v.page.description)}</p>` : ''}
<div class="lm-page-meta">${meta}${actions}</div>
${banner}
<div class="lm-body">
${v.html}
</div>
<div class="lm-end">${feedback}${editRow ? `<div class="lm-edit">${editRow}</div>` : ''}${pager}</div>
</article>`

  /* ── Table of contents ────────────────────────────────────────────── */
  const tocItems = v.headings.map((h) => `<li${h.depth === 3 ? ' class="lm-toc-sub"' : ''}><a href="#${esc(h.id)}" data-id="${esc(h.id)}">${esc(h.text)}</a></li>`).join('')
  const toc = `<aside class="lm-toc" aria-label="${esc(s.onThisPage)}">
${v.headings.length ? `<p class="lm-toc-t">${icon('list')}${esc(s.onThisPage)}</p><div class="lm-toc-track"><span class="lm-toc-mark" aria-hidden="true"></span><ul>${tocItems}</ul></div>` : ''}
<div class="lm-toc-extra">
${config.assistant.enabled ? `<button type="button" data-lm="ask">${icon('sparkles')}${esc(s.askAboutPage)}</button>` : ''}
<button type="button" data-lm="source">${icon('file')}${esc(s.viewSource)}</button>
${v.page.editUrl ? `<a href="${esc(v.page.editUrl)}" target="_blank" rel="noopener">${icon('pencil')}${esc(s.editPage)}</a>` : ''}
</div>
</aside>`
  const tocBar = v.headings.length
    ? `<div class="lm-tocbar"><button type="button" data-lm="tocbar" aria-expanded="false">${icon('list')}<span class="lm-tocbar-k">${esc(s.onThisPage)}</span><span class="lm-tocbar-cur"></span>${icon('down', 'lm-chev')}</button><div class="lm-tocbar-panel" hidden><ul>${tocItems}</ul></div></div>`
    : ''

  const footer = `<footer class="lm-foot">
<span class="lm-foot-mark">${lumyMark()}${fill(esc(s.poweredBy), { lumy: '<strong>Lumy</strong>' })}</span>
<span class="lm-grow"></span>
${config.llms ? `<a href="${esc(config.base)}llms.txt">llms.txt</a>` : ''}
${config.llms || config.mcp.enabled ? `<button type="button" data-lm="ai-tools">MCP</button>` : ''}
</footer>`

  /* ── Overlays ─────────────────────────────────────────────────────── */
  const search = config.search
    ? `<div class="lm-overlay lm-search" id="lm-search" hidden><div class="lm-search-card" role="dialog" aria-modal="true" aria-label="${esc(s.search)}"><div class="lm-search-in">${icon('search')}<input id="lm-search-input" type="search" autocomplete="off" spellcheck="false" placeholder="${esc(s.searchPlaceholder)}" aria-controls="lm-search-res"><kbd>Esc</kbd></div><div class="lm-search-res" id="lm-search-res" role="listbox"></div><div class="lm-search-foot"><span><kbd>↑</kbd><kbd>↓</kbd>${esc(s.searchMove)}</span><span><kbd>↵</kbd>${esc(s.searchOpen)}</span><span class="lm-grow"></span><span>${esc(s.searchTypos)}</span></div></div></div>`
    : ''
  const ai = config.assistant.enabled
    ? `<div class="lm-overlay lm-sheet-wrap" id="lm-ai" hidden><aside class="lm-sheet" role="dialog" aria-modal="true" aria-labelledby="lm-ai-title"><header class="lm-sheet-head">${icon('sparkles')}<h2 id="lm-ai-title">${esc(s.assistantTitle)}</h2><span class="lm-grow"></span><button class="lm-icon-btn" type="button" data-lm="close" aria-label="${esc(s.close)}">${icon('x')}</button></header><div class="lm-ai-msgs" id="lm-ai-msgs"><p class="lm-ai-welcome">${esc(s.assistantWelcome)}</p></div><form class="lm-ai-form" id="lm-ai-form"><input id="lm-ai-input" autocomplete="off" placeholder="${esc(s.assistantPlaceholder)}" aria-label="${esc(s.assistantPlaceholder)}"><button class="lm-btn lm-btn-primary" type="submit" aria-label="${esc(s.send)}">${icon('send')}</button></form><p class="lm-ai-note">${esc(s.assistantNote)}</p></aside></div>`
    : ''
  const overlays = `${search}${ai}
<div class="lm-overlay" id="lm-dialog" hidden><div class="lm-dialog" role="dialog" aria-modal="true" aria-labelledby="lm-dialog-title"><div class="lm-dialog-head"><h2 id="lm-dialog-title"></h2><button class="lm-icon-btn" type="button" data-lm="close" aria-label="${esc(s.close)}">${icon('x')}</button></div><div class="lm-dialog-body" id="lm-dialog-body"></div></div></div>
<div class="lm-lightbox" id="lm-lightbox" hidden role="dialog" aria-modal="true" aria-label="${esc(s.enlarge)}"><div class="lm-lb-bar"><span>${esc(s.imageHint)}</span><button class="lm-icon-btn" type="button" data-lm="close" aria-label="${esc(s.close)}">${icon('x')}</button></div><div class="lm-lb-scroll"><img id="lm-lb-img" alt=""></div></div>
<div class="lm-gloss" id="lm-gloss" role="tooltip" hidden></div>
<div class="lm-toast" id="lm-toast" role="status" aria-live="polite"></div>`

  const data = {
    lang,
    base: config.base,
    slug: v.page.slug,
    title: v.page.title,
    search: config.search ? v.searchUrl : null,
    source: v.sourceUrl,
    strings: {
      copy: s.copy, copied: s.copied, pageCopied: s.pageCopied, linkCopied: s.linkCopied, noResults: s.noResults,
      suggestions: s.suggestions, resultPages: s.resultPages, resultSections: s.resultSections, resultGlossary: s.resultGlossary,
      glossary: s.glossary, glossaryMore: s.glossaryMore, sourceTitle: s.sourceTitle, sourceIntro: s.sourceIntro,
      aiToolsTitle: s.aiToolsTitle, aiToolsIntro: s.aiToolsIntro, llmsTxt: s.llmsTxt, llmsFull: s.llmsFull, mcpRemote: s.mcpRemote,
      sources: s.sources, assistantError: s.assistantError, feedbackThanks: s.feedbackThanks, stepToggle: s.stepToggle,
      signIn: s.signIn, signOut: s.signOut, dashboard: s.dashboard, account: s.account,
    },
    glossary: v.glossary,
    glossaryUrl: v.glossaryUrl,
    assistant: config.assistant.enabled ? { endpoint: config.assistant.endpoint || `${config.base}_lumy/api/ask` } : null,
    feedback: config.feedback.enabled ? { endpoint: config.feedback.endpoint || `${config.base}_lumy/api/feedback` } : null,
    llms: config.llms ? { index: `${config.base}llms.txt`, full: `${config.base}llms-full.txt` } : null,
    mcp: config.mcp.enabled ? { url: config.mcp.url || (config.url ? `${config.url}${config.base}_lumy/mcp` : `${config.base}_lumy/mcp`) } : null,
    server: config.server ? { registration: config.server.registration, private: config.server.private } : null,
    dev: v.dev || false,
  }

  return `${head}
<body>
${sprite()}
<a class="lm-skip" href="#lm-content">${esc(s.skipToContent)}</a>
${header}
<div class="lm-layout">
${sidebar}
<div class="lm-scrim" data-lm="drawer-close" hidden></div>
<main class="lm-main" id="lm-content" tabindex="-1">
${tocBar}
<div class="lm-content">
${article}
</div>
${footer}
</main>
${toc}
</div>
${overlays}
<script type="application/json" id="lm-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
${v.dev ? `<script>new EventSource('${config.base}_lumy/live').onmessage=function(){location.reload()}</script>` : ''}
</body>
</html>
`
}

function lumyMark() {
  return '<svg class="lm-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="var(--lm-primary)"/><circle cx="12" cy="12" r="9" fill="none" stroke="var(--lm-primary)" stroke-opacity=".35" stroke-width="1.6"/></svg>'
}

/** The root index.html: sends the reader to their language, and maps old "#/page" links. */
export function renderRedirect({ config, targets, legacy }) {
  const def = config.defaultLanguage
  const map = JSON.stringify(targets)
  return `<!doctype html>
<html lang="${esc(def)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(config.title)}</title>
<meta name="robots" content="noindex">
<noscript><meta http-equiv="refresh" content="0; url=${esc(targets[def])}"></noscript>
<script>
(function(){
  var t=${map}, def=${JSON.stringify(def)}, base=${JSON.stringify(config.base)}, lang=def;
  try{ var saved=JSON.parse(localStorage.getItem('lumy.lang')); if(saved&&t[saved]) lang=saved; else {
    var prefs=navigator.languages||[navigator.language||def];
    for(var i=0;i<prefs.length;i++){var c=String(prefs[i]).toLowerCase(); if(t[c]){lang=c;break} c=c.split('-')[0]; if(t[c]){lang=c;break}}
  }}catch(e){}
  var h=location.hash;
  ${legacy ? `if(/^#\\/./.test(h)){ var p=h.slice(2).replace(/[?#].*$/,'').replace(/\\.md$/,'').replace(/(^|\\/)(README|index)$/,'').replace(/\\/$/,''); var first=p.split('/')[0]; if(t[first]){lang=first;p=p.split('/').slice(1).join('/')} location.replace(t[lang]+(p?p+'/':'')); return }` : ''}
  location.replace(t[lang]);
})();
</script>
</head>
<body><p><a href="${esc(targets[def])}">${esc(config.title)}</a></p></body>
</html>
`
}
