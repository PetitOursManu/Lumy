/*
 * Lumy — reader-side behaviour.
 *
 * The page is complete without this file. What it adds: search, theme and
 * language switches, the interactive blocks (tabs, steps, values, hotspots,
 * quiz, glossary), the assistant, and motion on every one of them. No
 * dependencies; a site registers its own widgets with Lumy.widget(name, fn).
 */
;(() => {
  'use strict'
  const d = document
  const html = d.documentElement
  const dataEl = d.getElementById('lm-data')
  if (!dataEl) return
  const DATA = JSON.parse(dataEl.textContent)
  const S = DATA.strings
  const $ = (sel, ctx) => (ctx || d).querySelector(sel)
  const $$ = (sel, ctx) => Array.from((ctx || d).querySelectorAll(sel))
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const moving = () => !reduced.matches
  const EASE = 'cubic-bezier(.2,.8,.2,1)'
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const store = {
    get(k, fallback) {
      try {
        const v = localStorage.getItem('lumy.' + k)
        return v === null ? fallback : JSON.parse(v)
      } catch {
        return fallback
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('lumy.' + k, JSON.stringify(v))
      } catch {
        /* Private mode or storage full: the preference lasts for this page only. */
      }
    },
  }

  /* ── Motion helpers ─────────────────────────────────────────────────── */

  /** Show an element that animates in through its .is-open class. */
  function open(el) {
    clearTimeout(el._lmHide)
    el.hidden = false
    void el.offsetWidth
    el.classList.add('is-open')
  }
  /** The reverse: animate out, then hide. */
  function close(el, ms = 340, after) {
    el.classList.remove('is-open')
    clearTimeout(el._lmHide)
    el._lmHide = setTimeout(() => {
      if (!el.classList.contains('is-open')) el.hidden = true
      after?.()
    }, moving() ? ms : 0)
  }
  function animateHeight(el, from, to, ms = 320) {
    if (!moving() || from === to) return Promise.resolve()
    el.style.overflow = 'hidden'
    const a = el.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: ms, easing: EASE })
    return a.finished.then(() => (el.style.overflow = ''), () => (el.style.overflow = ''))
  }
  function fadeIn(el, dy = 6, ms = 280) {
    if (!moving() || !el) return
    el.animate([{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: 'none' }], { duration: ms, easing: EASE })
  }
  function flash(el) {
    el.classList.remove('lm-flash')
    void el.offsetWidth
    el.classList.add('lm-flash')
    setTimeout(() => el.classList.remove('lm-flash'), 1700)
  }
  function scrollToEl(el) {
    el.scrollIntoView({ behavior: moving() ? 'smooth' : 'auto', block: 'start' })
  }

  let lockDepth = 0
  function lockScroll(on) {
    lockDepth = Math.max(0, lockDepth + (on ? 1 : -1))
    if (lockDepth === 1 && on) {
      const gap = innerWidth - html.clientWidth
      html.style.overflow = 'hidden'
      if (gap > 0) html.style.paddingRight = gap + 'px'
    } else if (lockDepth === 0) {
      html.style.overflow = ''
      html.style.paddingRight = ''
    }
  }

  /* ── Toast & clipboard ──────────────────────────────────────────────── */
  const toastEl = $('#lm-toast')
  let toastTimer
  function toast(msg) {
    if (!toastEl) return
    toastEl.textContent = msg
    toastEl.hidden = false
    void toastEl.offsetWidth
    toastEl.classList.add('is-open')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('is-open'), 2600)
  }
  function fallbackCopy(text) {
    const ta = d.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    d.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = d.execCommand('copy')
    } catch {}
    ta.remove()
    return ok
  }
  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text))
    return Promise.resolve(fallbackCopy(text))
  }

  /* ── Theme ──────────────────────────────────────────────────────────── */
  const darkQuery = matchMedia('(prefers-color-scheme: dark)')
  const themeNow = () => {
    const t = html.getAttribute('data-theme')
    return t === 'dark' || t === 'light' ? t : darkQuery.matches ? 'dark' : 'light'
  }
  const syncTheme = () => $$('.lm-theme-btn').forEach((b) => b.setAttribute('data-mode', themeNow()))
  darkQuery.addEventListener?.('change', syncTheme)
  syncTheme()

  function toggleTheme(button) {
    const next = themeNow() === 'dark' ? 'light' : 'dark'
    const apply = () => {
      html.setAttribute('data-theme', next)
      store.set('theme', next)
      syncTheme()
    }
    if (!d.startViewTransition || !moving()) return apply()
    // The new theme grows as a circle from the button.
    const r = button.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    html.classList.add('lm-vt-theme')
    const vt = d.startViewTransition(apply)
    vt.ready.then(() => {
      html.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, { duration: 520, easing: EASE, pseudoElement: '::view-transition-new(root)' })
    })
    vt.finished.finally(() => html.classList.remove('lm-vt-theme'))
  }

  /* ── Menus ──────────────────────────────────────────────────────────── */
  function closeMenus(except) {
    $$('.lm-menu').forEach((m) => {
      if (m === except || m.hidden) return
      close(m, 220)
      m.parentElement.querySelector('[aria-haspopup]')?.setAttribute('aria-expanded', 'false')
    })
  }
  function toggleMenu(button) {
    const menu = button.parentElement.querySelector('.lm-menu')
    const opening = menu.hidden || !menu.classList.contains('is-open')
    closeMenus(menu)
    if (opening) {
      open(menu)
      button.setAttribute('aria-expanded', 'true')
      menu.querySelector('a,button')?.focus({ preventScroll: true })
    } else {
      close(menu, 220)
      button.setAttribute('aria-expanded', 'false')
    }
  }

  /* ── Drawer (small screens) ─────────────────────────────────────────── */
  const scrim = $('.lm-scrim')
  const drawerBtn = $('.lm-menu-btn')
  function openDrawer() {
    html.classList.add('lm-drawer-open')
    if (scrim) open(scrim)
    drawerBtn?.setAttribute('aria-expanded', 'true')
    lockScroll(true)
    $('.lm-side .lm-nav-a.is-current')?.scrollIntoView({ block: 'center' })
  }
  function closeDrawer() {
    if (!html.classList.contains('lm-drawer-open')) return
    html.classList.remove('lm-drawer-open')
    if (scrim) close(scrim)
    drawerBtn?.setAttribute('aria-expanded', 'false')
    lockScroll(false)
  }

  /* Keep the sidebar where the reader left it between pages. */
  const side = $('.lm-side')
  if (side) {
    try {
      const saved = JSON.parse(sessionStorage.getItem('lumy.side') || 'null')
      if (saved && saved.w === innerWidth) side.scrollTop = saved.top
    } catch {}
    const cur = $('.lm-nav-a.is-current', side)
    if (cur) {
      const r = cur.getBoundingClientRect()
      const sr = side.getBoundingClientRect()
      if (r.top < sr.top || r.bottom > sr.bottom) cur.scrollIntoView({ block: 'center' })
    }
    addEventListener('pagehide', () => {
      try {
        sessionStorage.setItem('lumy.side', JSON.stringify({ top: side.scrollTop, w: innerWidth }))
      } catch {}
    })
  }

  /* ── Sliding indicators (tabs, segmented controls) ──────────────────── */
  function placeIndicator(list, ind, active) {
    if (!list || !ind || !active) return
    ind.style.width = active.offsetWidth + 'px'
    ind.style.transform = `translateX(${active.offsetLeft}px)`
    if (!list.classList.contains('lm-ready') && active.offsetWidth) requestAnimationFrame(() => list.classList.add('lm-ready'))
  }
  const indicatorObserver = 'ResizeObserver' in window ? new ResizeObserver((entries) => entries.forEach((e) => e.target._lmPlace?.())) : null
  function trackIndicator(list, ind, activeSel) {
    list._lmPlace = () => placeIndicator(list, ind, $(activeSel, list))
    list._lmPlace()
    indicatorObserver?.observe(list)
  }

  /* ── Audience filter ────────────────────────────────────────────────── */
  const seg = $('.lm-seg')
  function setAudience(value, animate) {
    if (!seg) return
    $$('[data-aud]', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.aud === value)))
    seg._lmPlace?.()
    $$('.lm-group').forEach((group) => {
      let any = false
      $$('li[data-aud]', group).forEach((li) => {
        const show = value === 'all' || li.dataset.aud.split(' ').includes(value)
        const was = !li.classList.contains('is-filtered')
        li.classList.toggle('is-filtered', !show)
        if (show) any = true
        if (show && !was && animate) fadeIn(li, 4, 220)
      })
      $$('li:not([data-aud])', group).forEach(() => (any = true))
      group.classList.toggle('is-empty', !any)
    })
    store.set('aud', value)
  }
  if (seg) {
    trackIndicator(seg, $('.lm-seg-ind', seg), '[aria-pressed="true"]')
    setAudience(store.get('aud', 'all'), false)
  }

  /* ── Table of contents & scroll spy ─────────────────────────────────── */
  const tocLinks = $$('.lm-toc a[data-id]')
  const barLinks = $$('.lm-tocbar a[data-id]')
  const tocMark = $('.lm-toc-mark')
  const barCur = $('.lm-tocbar-cur')
  const headings = tocLinks.map((a) => d.getElementById(a.dataset.id)).filter(Boolean)
  let activeId = null
  function setActive(id) {
    if (id === activeId) return
    activeId = id
    for (const a of [...tocLinks, ...barLinks]) a.classList.toggle('is-active', a.dataset.id === id)
    const link = tocLinks.find((a) => a.dataset.id === id)
    if (tocMark && link) {
      tocMark.style.transform = `translateY(${link.offsetTop}px)`
      tocMark.style.height = link.offsetHeight + 'px'
      tocMark.classList.add('is-on')
    }
    if (barCur) {
      const text = link ? link.textContent : ''
      if (barCur.textContent !== text) {
        barCur.textContent = text
        fadeIn(barCur, 4, 200)
      }
    }
  }
  let spyQueued = false
  function spy() {
    spyQueued = false
    if (!headings.length) return
    const offset = ($('.lm-top')?.offsetHeight || 56) + 70
    let current = headings[0]
    for (const h of headings) {
      if (h.getBoundingClientRect().top < offset) current = h
      else break
    }
    if (innerHeight + scrollY >= html.scrollHeight - 4) current = headings[headings.length - 1]
    setActive(current.id)
  }
  addEventListener('scroll', () => {
    if (!spyQueued) {
      spyQueued = true
      requestAnimationFrame(spy)
    }
    if (glossEl && !glossEl.hidden) closeGloss()
  }, { passive: true })
  addEventListener('resize', () => {
    activeId = null
    spy()
  })

  const tocbarBtn = $('.lm-tocbar > button')
  const tocbarPanel = $('.lm-tocbar-panel')
  function toggleTocbar(force) {
    if (!tocbarPanel) return
    const opening = force ?? tocbarPanel.hidden
    const from = tocbarPanel.offsetHeight
    if (opening) {
      tocbarPanel.hidden = false
      animateHeight(tocbarPanel, 0, tocbarPanel.offsetHeight, 300)
    } else {
      animateHeight(tocbarPanel, from, 0, 240).then(() => (tocbarPanel.hidden = true))
      if (!moving()) tocbarPanel.hidden = true
    }
    tocbarBtn.setAttribute('aria-expanded', String(opening))
  }

  function goToHash(id, push) {
    const target = d.getElementById(id)
    if (!target) return false
    if (push) history.pushState(null, '', '#' + id)
    scrollToEl(target)
    flash(target)
    return true
  }

  /* ── Tabs ───────────────────────────────────────────────────────────── */
  function selectTab(tabs, key, { animate = true, remember = true } = {}) {
    const list = $('.lm-tablist', tabs)
    const panels = $('.lm-tabpanels', tabs)
    const target = $(`[role="tab"][data-tab="${CSS.escape(key)}"]`, list)
    if (!target || target.getAttribute('aria-selected') === 'true') return false
    const before = panels.offsetHeight
    $$('[role="tab"]', list).forEach((b) => {
      const on = b === target
      b.setAttribute('aria-selected', String(on))
      b.tabIndex = on ? 0 : -1
    })
    let shown
    $$(':scope > [role="tabpanel"]', panels).forEach((p) => {
      p.hidden = p.dataset.tab !== key
      if (!p.hidden) shown = p
    })
    list._lmPlace?.()
    if (animate) {
      animateHeight(panels, before, panels.offsetHeight, 300)
      fadeIn(shown, 6, 260)
    }
    if (remember && tabs.dataset.group) store.set('tab.' + tabs.dataset.group, key)
    return true
  }
  const allTabs = $$('.lm-tabs')
  allTabs.forEach((tabs) => {
    const list = $('.lm-tablist', tabs)
    trackIndicator(list, $('.lm-tab-ind', list), '[aria-selected="true"]')
    const saved = tabs.dataset.group && store.get('tab.' + tabs.dataset.group, null)
    if (saved) selectTab(tabs, saved, { animate: false, remember: false })
  })
  function onTabClick(btn) {
    const tabs = btn.closest('.lm-tabs')
    const key = btn.dataset.tab
    selectTab(tabs, key)
    // Every block of the same group follows, on this page and the next.
    if (tabs.dataset.group) allTabs.filter((t) => t !== tabs && t.dataset.group === tabs.dataset.group).forEach((t) => selectTab(t, key, { remember: false }))
  }

  /* ── Collapsible blocks ─────────────────────────────────────────────── */
  function toggleCollapse(details) {
    const body = $('.lm-collapse-body', details)
    if (!moving() || !body) {
      details.open = !details.open
      return
    }
    if (details._lmBusy) return
    details._lmBusy = true
    if (!details.open) {
      details.open = true
      const h = body.offsetHeight
      body.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: 320, easing: EASE }).finished.finally(() => (details._lmBusy = false))
      $$('.lm-tablist', details).forEach((l) => l._lmPlace?.())
    } else {
      const h = body.offsetHeight
      details.classList.add('is-closing')
      const chev = $('summary .lm-chev', details)
      chev?.animate([{ transform: 'rotate(180deg)' }, { transform: 'rotate(0deg)' }], { duration: 300, easing: EASE })
      body.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 260, easing: EASE }).finished.finally(() => {
        details.open = false
        details.classList.remove('is-closing')
        details._lmBusy = false
      })
    }
  }

  /* ── Steps ──────────────────────────────────────────────────────────── */
  function stepsKey(block) {
    return `steps.${DATA.slug || 'home'}.${block.dataset.steps}`
  }
  function renderSteps(block, popIndex) {
    const done = store.get(stepsKey(block), [])
    const items = $$('.lm-step', block)
    items.forEach((li, i) => {
      const on = done.includes(i)
      li.classList.toggle('is-done', on)
      $('.lm-step-check', li).setAttribute('aria-pressed', String(on))
      if (i === popIndex && on && moving()) {
        li.classList.remove('is-popping')
        void li.offsetWidth
        li.classList.add('is-popping')
      }
    })
    const count = done.filter((i) => i < items.length).length
    $('.lm-steps-count', block).textContent = `${count} / ${items.length}`
    $('.lm-steps-bar i', block).style.width = (count / items.length) * 100 + '%'
  }
  $$('.lm-steps').forEach((b) => renderSteps(b))

  /* ── Your values ────────────────────────────────────────────────────── */
  const varInputs = $$('input[data-var]')
  let vars = Object.assign({}, store.get('vars', {}))
  function paintVars(pulse) {
    $$('.lm-var').forEach((el) => {
      const input = varInputs.find((i) => i.dataset.var === el.dataset.var)
      const value = vars[el.dataset.var] || input?.dataset.default
      if (value === undefined || el.textContent === value) return
      el.textContent = value
      if (pulse) {
        el.classList.add('is-pulse')
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-pulse')))
      }
    })
  }
  varInputs.forEach((input) => {
    if (vars[input.dataset.var]) input.value = vars[input.dataset.var]
    input.addEventListener('input', () => {
      const v = input.value.trim()
      if (v && v !== input.dataset.default) vars[input.dataset.var] = v
      else delete vars[input.dataset.var]
      varInputs.filter((o) => o !== input && o.dataset.var === input.dataset.var).forEach((o) => (o.value = input.value))
      store.set('vars', vars)
      paintVars(true)
    })
  })
  paintVars(false)

  /* ── Annotated screenshots ──────────────────────────────────────────── */
  function setSpot(fig, i, animate = true) {
    const items = $$('.lm-hs-list > li', fig)
    const n = items.length
    if (!n) return
    const index = (i + n) % n
    fig._lmIndex = index
    $$('.lm-hs-dot', fig).forEach((dot) => dot.setAttribute('aria-pressed', String(Number(dot.dataset.i) === index)))
    const item = items[index]
    const head = $('.lm-hs-head', fig)
    const text = $('.lm-hs-text', fig)
    $('.lm-hs-num', fig).textContent = index + 1
    $('.lm-hs-title', fig).innerHTML = $('.lm-hs-li-t', item).innerHTML
    $('.lm-hs-count', fig).textContent = `${index + 1} / ${n}`
    text.innerHTML = $('.lm-hs-li-x', item).innerHTML
    if (animate) {
      fadeIn(head, 4, 240)
      fadeIn(text, 6, 300)
    }
  }
  $$('.lm-hs').forEach((fig) => (fig._lmIndex = 0))

  /* ── Glossary ───────────────────────────────────────────────────────── */
  const glossEl = $('#lm-gloss')
  let glossFor = null
  let hoverTimer
  function openGloss(term) {
    const g = DATA.glossary?.[term.dataset.term]
    if (!g || !glossEl) return
    if (glossFor && glossFor !== term) glossFor.setAttribute('aria-expanded', 'false')
    glossFor = term
    const more = DATA.glossaryUrl ? `<a href="${esc(DATA.glossaryUrl)}#${esc(term.dataset.term)}">${esc(S.glossaryMore)} →</a>` : ''
    glossEl.innerHTML = `<div class="lm-gloss-k">${esc(S.glossary)}</div><div class="lm-gloss-t">${esc(g.term)}</div><p>${esc(g.def)}</p>${more}`
    glossEl.hidden = false
    const r = term.getBoundingClientRect()
    const w = Math.min(320, innerWidth - 32)
    glossEl.style.width = w + 'px'
    glossEl.style.left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, innerWidth - 16 - w)) + 'px'
    let top = r.bottom + 8
    const above = top + glossEl.offsetHeight > innerHeight - 16
    if (above) top = Math.max(16, r.top - 8 - glossEl.offsetHeight)
    glossEl.classList.toggle('is-above', above)
    glossEl.style.top = top + 'px'
    term.setAttribute('aria-expanded', 'true')
    term.setAttribute('aria-describedby', 'lm-gloss')
    void glossEl.offsetWidth
    glossEl.classList.add('is-open')
  }
  function closeGloss() {
    if (!glossEl || glossEl.hidden) return
    glossFor?.setAttribute('aria-expanded', 'false')
    glossFor = null
    close(glossEl, 220)
  }
  d.addEventListener('mouseover', (e) => {
    const term = e.target.closest?.('.lm-term')
    if (term) {
      clearTimeout(hoverTimer)
      if (glossFor !== term) hoverTimer = setTimeout(() => openGloss(term), 180)
      return
    }
    if (e.target.closest?.('#lm-gloss')) return clearTimeout(hoverTimer)
    if (glossFor) {
      clearTimeout(hoverTimer)
      hoverTimer = setTimeout(closeGloss, 260)
    }
  })

  /* ── Quiz ───────────────────────────────────────────────────────────── */
  function answer(opt) {
    const quiz = opt.closest('.lm-quiz')
    const ok = opt.dataset.ok === '1'
    opt.classList.remove('is-bad')
    void opt.offsetWidth
    opt.classList.add(ok ? 'is-ok' : 'is-bad')
    const good = $('.lm-quiz-ok', quiz)
    const bad = $('.lm-quiz-bad', quiz)
    const show = ok ? good : bad
    const hide = ok ? bad : good
    hide.hidden = true
    if (show.hidden) {
      show.hidden = false
      animateHeight(show, 0, show.offsetHeight, 300)
      fadeIn(show.firstElementChild, 4, 300)
    }
    if (ok) $$('.lm-quiz-opt', quiz).forEach((o) => (o.disabled = true))
  }

  /* ── Feedback ───────────────────────────────────────────────────────── */
  function sendFeedback(box, payload) {
    const endpoint = DATA.feedback?.endpoint
    if (!endpoint) return
    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page: DATA.slug, lang: DATA.lang, url: location.pathname, ...payload }),
      keepalive: true,
    }).catch(() => {})
  }
  function thank(box) {
    const thanks = $('.lm-fb-thanks', box)
    const form = $('.lm-fb-form', box)
    if (!form.hidden) {
      const h = form.offsetHeight
      animateHeight(form, h, 0, 240).then(() => (form.hidden = true))
      if (!moving()) form.hidden = true
    }
    thanks.hidden = false
    fadeIn(thanks, 4, 300)
  }

  /* ── Dialogs ────────────────────────────────────────────────────────── */
  let lastFocus = null
  function openOverlay(el, focusSel) {
    lastFocus = d.activeElement
    open(el)
    lockScroll(true)
    const f = focusSel ? $(focusSel, el) : $('button, input, a', el)
    f?.focus({ preventScroll: true })
  }
  function closeOverlay(el) {
    if (!el || el.hidden) return
    close(el, 340)
    lockScroll(false)
    lastFocus?.focus?.({ preventScroll: true })
  }
  const dialog = $('#lm-dialog')
  function showDialog(title, bodyHtml) {
    $('#lm-dialog-title').textContent = title
    const body = $('#lm-dialog-body')
    body.innerHTML = bodyHtml
    body.scrollTop = 0
    openOverlay(dialog, '.lm-dialog-head button')
  }
  let sourceText = null
  function getSource() {
    if (sourceText !== null) return Promise.resolve(sourceText)
    if (!DATA.source) return Promise.resolve('')
    return fetch(DATA.source)
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => (sourceText = t))
      .catch(() => '')
  }
  function codeBlock(label, code) {
    return `<div class="lm-code"><div class="lm-code-head"><span class="lm-code-title">${esc(label)}</span><button class="lm-copy" type="button" aria-label="${esc(S.copy)}"><svg class="lm-i lm-i-copy"><use href="#lm-i-copy"/></svg><svg class="lm-i lm-i-done"><use href="#lm-i-check"/></svg><span>${esc(S.copy)}</span></button></div><pre><code>${esc(code)}</code></pre></div>`
  }
  function showAiTools() {
    let body = `<p>${esc(S.aiToolsIntro)}</p>`
    if (DATA.llms) {
      body += `<ul class="lm-list-links"><li><a href="${esc(DATA.llms.index)}" target="_blank" rel="noopener"><code>llms.txt</code><small>${esc(S.llmsTxt)}</small></a></li><li><a href="${esc(DATA.llms.full)}" target="_blank" rel="noopener"><code>llms-full.txt</code><small>${esc(S.llmsFull)}</small></a></li></ul>`
    }
    if (DATA.mcp) {
      const url = new URL(DATA.mcp.url, location.href).href
      const name = (d.title.split(' — ').pop() || 'docs').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      body += `<p>${esc(S.mcpRemote)}</p>${codeBlock('MCP', JSON.stringify({ mcpServers: { [name]: { url } } }, null, 2))}`
    }
    showDialog(S.aiToolsTitle, body)
  }

  /* ── Lightbox ───────────────────────────────────────────────────────── */
  const lightbox = $('#lm-lightbox')
  const lbImg = $('#lm-lb-img')
  let lbFrom = null
  function openLightbox(img) {
    if (!lightbox) return
    lbFrom = img
    lastFocus = d.activeElement
    lbImg.src = img.currentSrc || img.src
    lbImg.alt = img.alt
    open(lightbox)
    lockScroll(true)
    $('.lm-icon-btn', lightbox)?.focus({ preventScroll: true })
    const fly = () => {
      if (!moving()) return
      const a = img.getBoundingClientRect()
      const b = lbImg.getBoundingClientRect()
      if (!b.width) return
      lbImg.animate(
        [{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})` }, { transform: 'none' }],
        { duration: 380, easing: EASE },
      )
    }
    if (lbImg.complete) requestAnimationFrame(fly)
    else lbImg.onload = () => requestAnimationFrame(fly)
  }
  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return
    if (moving() && lbFrom) {
      const a = lbFrom.getBoundingClientRect()
      const b = lbImg.getBoundingClientRect()
      if (b.width && a.width) {
        lbImg.animate([{ transform: 'none' }, { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})` }], { duration: 300, easing: EASE, fill: 'forwards' })
      }
    }
    close(lightbox, 320, () => lbImg.getAnimations().forEach((an) => an.cancel()))
    lockScroll(false)
    lastFocus?.focus?.({ preventScroll: true })
  }

  /* ── Search ─────────────────────────────────────────────────────────── */
  const searchEl = $('#lm-search')
  const searchInput = $('#lm-search-input')
  const resultsEl = $('#lm-search-res')
  let indexPromise = null
  let results = []
  let activeResult = 0
  const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(DATA.search)
        .then((r) => r.json())
        .then((idx) =>
          idx.items.map((it) => ({ ...it, nt: norm(it.h || it.p), np: norm(it.p), nx: norm(it.t), words: null })),
        )
        .catch(() => [])
    }
    return indexPromise
  }
  function lev(a, b) {
    const m = a.length
    const n = b.length
    let prev = Array.from({ length: n + 1 }, (_, j) => j)
    for (let i = 1; i <= m; i++) {
      const cur = [i]
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
    return prev[n]
  }
  /**
   * Relevance of one entry. Exact words weigh more in a heading than in a
   * title, and more in a title than in the text; the whole query found as a
   * phrase weighs most. A word with a typo still matches (same first letter,
   * one or two letters off), but exact matches win whenever there are any.
   */
  function score(it, toks, phrase) {
    let total = 0
    let fuzzy = false
    for (const tk of toks) {
      if (it.nt.includes(tk)) total += it.nt.startsWith(tk) ? 12 : 8
      else if (it.np.includes(tk)) total += 4
      else if (it.nx.includes(tk)) total += 1.5
      else if (tk.length >= 4) {
        if (!it.words) it.words = new Set((it.nt + ' ' + it.nx).split(/[^a-z0-9]+/).filter((w) => w.length >= 3))
        const tol = tk.length >= 7 ? 2 : 1
        let hit = false
        for (const w of it.words) {
          if (w[0] === tk[0] && Math.abs(w.length - tk.length) <= tol + 4 && lev(w.slice(0, tk.length), tk) <= tol) {
            hit = true
            break
          }
        }
        if (!hit) return { s: 0 }
        total += it.nt.split(/[^a-z0-9]+/).some((w) => w[0] === tk[0] && lev(w.slice(0, tk.length), tk) <= tol) ? 6 : 0.8
        fuzzy = true
      } else return { s: 0 }
    }
    if (phrase) {
      if (it.nt.includes(phrase)) total += 20
      else if (it.nx.includes(phrase)) total += 10
    }
    if (it.k === 'p') total *= 1.25
    return { s: total, fuzzy }
  }
  // Words too common to rank on, dropped when the query has better ones.
  const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'en', 'a', 'an', 'the', 'of', 'to', 'in', 'on', 'and', 'or', 'is', 'el', 'los', 'las', 'y', 'der', 'die', 'das', 'und', 'il', 'di', 'e', 'o', 'do', 'da'])
  function highlight(text, toks) {
    const n = norm(text)
    const marks = new Array(text.length).fill(false)
    for (const tk of toks) {
      let at = n.indexOf(tk)
      while (tk && at !== -1) {
        for (let j = at; j < at + tk.length && j < text.length; j++) marks[j] = true
        at = n.indexOf(tk, at + tk.length)
      }
    }
    let out = ''
    let openMark = false
    for (let i = 0; i < text.length; i++) {
      if (marks[i] && !openMark) (out += '<mark>'), (openMark = true)
      if (!marks[i] && openMark) (out += '</mark>'), (openMark = false)
      out += esc(text[i])
    }
    return out + (openMark ? '</mark>' : '')
  }
  function snippet(text, toks) {
    const n = norm(text)
    let at = -1
    for (const tk of toks) {
      const p = n.indexOf(tk)
      if (p !== -1 && (at === -1 || p < at)) at = p
    }
    const start = Math.max(0, at - 50)
    const s = text.slice(start, start + 160)
    return (start > 0 ? '…' : '') + s + (start + 160 < text.length ? '…' : '')
  }
  const KIND_ICON = { p: 'book', s: 'hash', g: 'bulb' }
  async function renderResults(q) {
    const items = await loadIndex()
    if (searchInput.value !== q) return
    const all = norm(q).split(/\s+/).filter(Boolean)
    const meaningful = all.filter((t) => !STOP.has(t))
    const toks = meaningful.length ? meaningful : all
    const phrase = all.length > 1 ? all.join(' ') : ''
    let groups
    if (!toks.length) {
      const here = location.pathname
      const onPage = items.filter((it) => it.k === 's' && it.u.split('#')[0] === here).slice(0, 6)
      groups = [[S.suggestions, onPage.length ? onPage : items.filter((it) => it.k === 'p').slice(0, 6)]]
    } else {
      let scored = items.map((it) => ({ it, ...score(it, toks, phrase) })).filter((x) => x.s > 0)
      if (scored.some((x) => !x.fuzzy)) scored = scored.filter((x) => !x.fuzzy)
      const hits = scored.sort((a, b) => b.s - a.s).map((x) => x.it)
      const take = (k, n) => hits.filter((it) => it.k === k).slice(0, n)
      // The group holding the best match comes first.
      const rank = (g) => (g[1].length ? hits.indexOf(g[1][0]) : Infinity)
      groups = [[S.resultPages, take('p', 5)], [S.resultSections, take('s', 8)], [S.resultGlossary, take('g', 4)]].sort((a, b) => rank(a) - rank(b))
    }
    results = groups.flatMap((g) => g[1])
    activeResult = 0
    if (!results.length) {
      resultsEl.innerHTML = `<div class="lm-sr-empty">${esc(S.noResults)} “${esc(q)}”</div>`
      return
    }
    let i = 0
    resultsEl.innerHTML = groups
      .filter((g) => g[1].length)
      .map(
        (g) =>
          `<div class="lm-sr-group">${esc(g[0])}</div>` +
          g[1]
            .map((it) => {
              const title = it.k === 's' ? `<span class="lm-sr-p">${esc(it.p)} › </span>${highlight(it.h, toks)}` : highlight(it.h || it.p, toks)
              const text = toks.length ? snippet(it.t, toks) : it.t.slice(0, 120) + (it.t.length > 120 ? '…' : '')
              return `<a class="lm-sr-item" role="option" href="${esc(it.u)}" data-r="${i}" style="--i:${i++}"><svg class="lm-i"><use href="#lm-i-${KIND_ICON[it.k] || 'hash'}"/></svg><span><span class="lm-sr-t">${title}</span><span class="lm-sr-s">${highlight(text, toks)}</span></span></a>`
            })
            .join(''),
      )
      .join('')
    markResult()
  }
  function markResult() {
    $$('.lm-sr-item', resultsEl).forEach((a, i) => {
      a.classList.toggle('is-active', i === activeResult)
      a.setAttribute('aria-selected', String(i === activeResult))
      if (i === activeResult) a.scrollIntoView({ block: 'nearest' })
    })
  }
  function openSearch() {
    if (!searchEl) return
    closeMenus()
    closeDrawer()
    closeGloss()
    openOverlay(searchEl, '#lm-search-input')
    searchInput.value = ''
    renderResults('')
  }
  function followResult(a) {
    const url = new URL(a.href, location.href)
    if (url.pathname === location.pathname && url.hash) {
      closeOverlay(searchEl)
      setTimeout(() => goToHash(decodeURIComponent(url.hash.slice(1)), true), moving() ? 120 : 0)
      return true
    }
    return false
  }
  if (searchEl) {
    searchInput.addEventListener('input', () => renderResults(searchInput.value))
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        activeResult = Math.min(activeResult + 1, results.length - 1)
        markResult()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        activeResult = Math.max(activeResult - 1, 0)
        markResult()
      } else if (e.key === 'Enter') {
        const a = $$('.lm-sr-item', resultsEl)[activeResult]
        if (!a) return
        e.preventDefault()
        if (!followResult(a)) location.href = a.href
      }
    })
    searchEl.addEventListener('mousedown', (e) => {
      if (e.target === searchEl) closeOverlay(searchEl)
    })
    // Load the index as soon as the reader shows intent.
    $$('[data-lm="search"]').forEach((b) => b.addEventListener('pointerenter', loadIndex, { once: true }))
  }

  /* ── Assistant ──────────────────────────────────────────────────────── */
  const aiEl = $('#lm-ai')
  const chat = []
  let asking = null

  /**
   * The answer as HTML: paragraphs, lists, code blocks, inline code, bold, and
   * [n] citations turned into links to the sources. Everything is escaped
   * first; only these few shapes are rebuilt.
   */
  function renderAnswer(text, sources) {
    const inline = (t) =>
      esc(t)
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[(\d{1,2})\]/g, (m, n) => {
          const src = sources[Number(n) - 1]
          return src ? `<a class="lm-cite" href="${esc(src.url)}" title="${esc(src.title)}">${n}</a>` : m
        })
    const out = []
    const parts = String(text).split(/```[\w-]*\n?/)
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        out.push(`<pre><code>${esc(part.replace(/\n$/, ''))}</code></pre>`)
        return
      }
      for (const block of part.split(/\n{2,}/)) {
        const lines = block.split('\n').filter((l) => l.trim())
        if (!lines.length) continue
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`)
        else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`)
        else out.push(`<p>${lines.map(inline).join('<br>')}</p>`)
      }
    })
    return out.join('')
  }

  async function ask(question) {
    const box = $('#lm-ai-msgs')
    $('.lm-ai-welcome', box)?.remove()
    const user = d.createElement('div')
    user.className = 'lm-msg lm-msg-user'
    user.textContent = question
    box.appendChild(user)
    const bot = d.createElement('div')
    bot.className = 'lm-msg lm-msg-bot'
    bot.innerHTML = '<span class="lm-typing"><i></i><i></i><i></i></span>'
    box.appendChild(bot)
    box.scrollTop = box.scrollHeight
    const form = $('#lm-ai-form')
    form.classList.add('is-busy')
    asking = new AbortController()

    let text = ''
    let sources = []
    let frame = 0
    // Sources appear once the answer is complete: the ones it cited, or all of them if it cited none.
    const paint = (final) => {
      frame = 0
      const cited = new Set([...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))
      const shown = cited.size ? sources.filter((s) => cited.has(s.n)) : sources
      const links = final && shown.length ? `<div class="lm-sources"><span>${esc(S.sources)}</span>${shown.map((s) => `<a href="${esc(s.url)}"><b>${s.n}</b>${esc(s.title)}</a>`).join('')}</div>` : ''
      bot.innerHTML = renderAnswer(text, sources) + (text ? '' : '<span class="lm-typing"><i></i><i></i><i></i></span>') + links
      const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80
      if (nearBottom) box.scrollTop = box.scrollHeight
    }
    const schedule = () => frame || (frame = requestAnimationFrame(() => paint(false)))
    try {
      const res = await fetch(DATA.assistant.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, history: chat.slice(-6), lang: DATA.lang, page: DATA.slug }),
        signal: asking.signal,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || S.assistantError)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl)
          buffer = buffer.slice(nl + 1)
          if (!line.trim()) continue
          const msg = JSON.parse(line)
          if (msg.type === 'sources') sources = msg.sources
          else if (msg.type === 'text') text += msg.text
          else if (msg.type === 'error') throw new Error(msg.message)
          schedule()
        }
      }
      if (frame) cancelAnimationFrame(frame)
      paint(true)
      fadeIn(bot.querySelector('.lm-sources'), 4, 260)
      chat.push({ role: 'user', content: question }, { role: 'assistant', content: text })
    } catch (err) {
      if (err.name !== 'AbortError') {
        bot.classList.add('lm-msg-error')
        bot.textContent = err.message || S.assistantError
      }
    } finally {
      asking = null
      form.classList.remove('is-busy')
      if (frame) cancelAnimationFrame(frame)
    }
  }
  if (aiEl) {
    $('#lm-ai-form').addEventListener('submit', (e) => {
      e.preventDefault()
      const input = $('#lm-ai-input')
      const q = input.value.trim()
      if (!q || asking) return
      input.value = ''
      ask(q)
    })
    aiEl.addEventListener('mousedown', (e) => {
      if (e.target === aiEl) closeOverlay(aiEl)
    })
  }

  /* ── Account (only on sites served by `lumy serve`) ─────────────────── */
  const accountEl = $('#lm-account')
  if (accountEl && DATA.server) {
    fetch(`${DATA.base}_lumy/api/me`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!me) return
        const here = encodeURIComponent(location.pathname + location.hash)
        if (me.user) {
          const initial = esc(me.user.username.slice(0, 1).toUpperCase())
          const dash = me.user.role === 'reader' ? '' : `<a href="${DATA.base}_lumy/admin" role="menuitem">${esc(S.dashboard)}</a>`
          accountEl.innerHTML = `<button class="lm-icon-btn lm-avatar-btn" type="button" data-lm="menu" aria-haspopup="true" aria-expanded="false" aria-label="${esc(S.account)}"><span class="lm-avatar">${initial}</span></button><div class="lm-menu" role="menu" hidden><p class="lm-menu-user">${esc(me.user.username)}</p>${dash}<button type="button" role="menuitem" data-lm="sign-out">${esc(S.signOut)}</button></div>`
        } else if (me.registration || me.private) {
          accountEl.innerHTML = `<a class="lm-btn lm-btn-sm" href="${DATA.base}_lumy/login?next=${here}">${esc(S.signIn)}</a>`
        } else return
        accountEl.hidden = false
        fadeIn(accountEl, 0, 220)
      })
      .catch(() => {})
  }
  function signOut() {
    fetch(`${DATA.base}_lumy/api/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).finally(() => location.reload())
  }

  /* ── Language switch keeps the reader's place ───────────────────────── */
  function rememberPlace(lang) {
    store.set('lang', lang)
    const h2s = $$('.lm-body h2[id]')
    const current = h2s.filter((h) => h.getBoundingClientRect().top < 160).length - 1
    try {
      sessionStorage.setItem('lumy.place', JSON.stringify({ slug: DATA.slug, index: current, y: scrollY }))
    } catch {}
  }
  try {
    const place = JSON.parse(sessionStorage.getItem('lumy.place') || 'null')
    sessionStorage.removeItem('lumy.place')
    if (place && place.slug === DATA.slug && !location.hash) {
      const h = $$('.lm-body h2[id]')[place.index]
      if (h) h.scrollIntoView({ block: 'start' })
    }
  } catch {}

  /* ── One click handler ──────────────────────────────────────────────── */
  d.addEventListener('click', (e) => {
    const t = e.target
    let el

    if ((el = t.closest('.lm-copy'))) {
      const code = el.closest('.lm-code')?.querySelector('pre')
      if (!code) return
      copyText(code.innerText.replace(/\n$/, '')).then(() => {
        const label = el.querySelector('span')
        el.classList.add('is-done')
        if (label) label.textContent = S.copied
        clearTimeout(el._lmT)
        el._lmT = setTimeout(() => {
          el.classList.remove('is-done')
          if (label) label.textContent = S.copy
        }, 1600)
      })
      return
    }
    if ((el = t.closest('.lm-tablist [role="tab"]'))) return onTabClick(el)
    if ((el = t.closest('.lm-collapse > summary'))) {
      e.preventDefault()
      return toggleCollapse(el.parentElement)
    }
    if ((el = t.closest('.lm-step-check'))) {
      const block = el.closest('.lm-steps')
      const i = $$('.lm-step', block).indexOf(el.closest('.lm-step'))
      const done = store.get(stepsKey(block), [])
      const at = done.indexOf(i)
      if (at === -1) done.push(i)
      else done.splice(at, 1)
      store.set(stepsKey(block), done)
      return renderSteps(block, i)
    }
    if ((el = t.closest('.lm-hs-dot'))) return setSpot(el.closest('.lm-hs'), Number(el.dataset.i))
    if ((el = t.closest('.lm-term'))) {
      clearTimeout(hoverTimer)
      return glossFor === el ? closeGloss() : openGloss(el)
    }
    if ((el = t.closest('.lm-quiz-opt'))) return answer(el)
    if ((el = t.closest('.lm-figure img'))) return openLightbox(el)
    if ((el = t.closest('.lm-sr-item'))) {
      if (followResult(el)) e.preventDefault()
      return
    }
    if ((el = t.closest('.lm-anchor'))) {
      e.preventDefault()
      const id = el.getAttribute('href').slice(1)
      goToHash(id, true)
      copyText(location.href.split('#')[0] + '#' + id).then(() => toast(S.linkCopied))
      return
    }
    if ((el = t.closest('.lm-toc a[data-id], .lm-tocbar a[data-id]'))) {
      e.preventDefault()
      if (el.closest('.lm-tocbar')) toggleTocbar(false)
      goToHash(el.dataset.id, true)
      return
    }

    el = t.closest('[data-lm]')
    if (!el) {
      if (!t.closest('.lm-menu-wrap')) closeMenus()
      if (!t.closest('#lm-gloss')) closeGloss()
      return
    }
    const act = el.dataset.lm
    if (act !== 'menu') closeMenus()
    switch (act) {
      case 'search':
        return openSearch()
      case 'theme':
        return toggleTheme(el)
      case 'menu':
        return toggleMenu(el)
      case 'lang':
        return rememberPlace(el.getAttribute('hreflang'))
      case 'drawer':
        return openDrawer()
      case 'drawer-close':
        return closeDrawer()
      case 'tocbar':
        return toggleTocbar()
      case 'aud':
        return setAudience(el.dataset.aud, true)
      case 'close': {
        const box = el.closest('.lm-overlay, .lm-lightbox')
        return box?.classList.contains('lm-lightbox') ? closeLightbox() : closeOverlay(box)
      }
      case 'copy-page':
        return getSource().then((text) => text && copyText(text).then(() => toast(S.pageCopied)))
      case 'source':
        return getSource().then((text) => showDialog(S.sourceTitle, `<p>${esc(S.sourceIntro)}</p><pre class="lm-src">${esc(text)}</pre>`))
      case 'ai-tools':
        return showAiTools()
      case 'ask':
        if (aiEl) openOverlay(aiEl, '#lm-ai-input')
        return
      case 'steps-reset': {
        const block = el.closest('.lm-steps')
        store.set(stepsKey(block), [])
        return renderSteps(block)
      }
      case 'vars-reset': {
        const box = el.closest('.lm-vars')
        $$('input[data-var]', box).forEach((input) => {
          delete vars[input.dataset.var]
          varInputs.filter((o) => o.dataset.var === input.dataset.var).forEach((o) => (o.value = o.dataset.default))
        })
        store.set('vars', vars)
        return paintVars(true)
      }
      case 'hs-prev':
      case 'hs-next': {
        const fig = el.closest('.lm-hs')
        return setSpot(fig, (fig._lmIndex || 0) + (act === 'hs-next' ? 1 : -1))
      }
      case 'zoom':
        return openLightbox($('img', el.closest('.lm-hs-stage')))
      case 'sign-out':
        return signOut()
      case 'fb': {
        const box = el.closest('.lm-fb')
        $$('.lm-fb-btns .lm-btn', box).forEach((b) => (b.disabled = true))
        el.classList.add('is-picked')
        if (el.dataset.value === 'yes') {
          sendFeedback(box, { value: 'yes' })
          return thank(box)
        }
        const form = $('.lm-fb-form', box)
        form.hidden = false
        animateHeight(form, 0, form.offsetHeight, 300)
        $('textarea', form).focus({ preventScroll: true })
        return
      }
    }
  })

  d.addEventListener('submit', (e) => {
    const form = e.target.closest('.lm-fb-form')
    if (!form) return
    e.preventDefault()
    const box = form.closest('.lm-fb')
    sendFeedback(box, { value: 'no', comment: $('textarea', form).value.trim().slice(0, 2000) })
    thank(box)
  })

  d.addEventListener('keydown', (e) => {
    const tab = e.target.closest?.('.lm-tablist [role="tab"]')
    if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End')) {
      const list = $$('[role="tab"]', tab.parentElement)
      const i = list.indexOf(tab)
      const next = e.key === 'Home' ? list[0] : e.key === 'End' ? list[list.length - 1] : list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]
      next.focus()
      onTabClick(next)
      e.preventDefault()
      return
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (searchEl && !searchEl.hidden) closeOverlay(searchEl)
      else openSearch()
      return
    }
    if (e.key === '/' && !typing) {
      e.preventDefault()
      openSearch()
      return
    }
    if (e.key === 'Escape') {
      if (glossEl && !glossEl.hidden) return closeGloss()
      if (lightbox && !lightbox.hidden) return closeLightbox()
      const overlay = $$('.lm-overlay').find((o) => !o.hidden && o.classList.contains('is-open'))
      if (overlay) return closeOverlay(overlay)
      if ($$('.lm-menu').some((m) => !m.hidden)) return closeMenus()
      if (tocbarPanel && !tocbarPanel.hidden) return toggleTocbar(false)
      closeDrawer()
    }
  })

  // Figures: keyboard can open them too.
  $$('.lm-figure img').forEach((img) => {
    img.tabIndex = 0
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openLightbox(img)
      }
    })
  })

  if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $$('.lm-kbd-k').forEach((k) => (k.textContent = '⌘K'))

  /* ── Widgets: a site's own interactive pieces ───────────────────────── */
  const registry = {}
  function hydrate(name) {
    $$(`[data-lumy-widget="${CSS.escape(name)}"]`).forEach((node) => {
      if (node._lmReady) return
      node._lmReady = true
      try {
        registry[name](node, { lang: DATA.lang, base: DATA.base, attrs: { ...node.dataset }, toast, store })
      } catch (err) {
        console.error(`[lumy] widget "${name}" failed`, err)
      }
    })
  }
  window.Lumy = {
    lang: DATA.lang,
    base: DATA.base,
    toast,
    widget(name, fn) {
      registry[name] = fn
      hydrate(name)
    },
  }

  // Fonts change widths: place the sliding indicators once they are in.
  d.fonts?.ready.then(() => $$('.lm-tablist, .lm-seg').forEach((l) => l._lmPlace?.()))
  spy()
})()
