/*
 * Lumy dashboard: sign-in, first-run setup, and the pages an administrator
 * or an editor needs. No framework; the server does the checks, this file
 * only draws and asks.
 */
;(() => {
  'use strict'
  const d = document
  const html = d.documentElement
  const D = JSON.parse(d.getElementById('ad-data').textContent)
  const app = d.getElementById('ad-app')
  const API = D.base + '_lumy/api/'
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  if (D.brand) {
    html.style.setProperty('--brand-l', D.brand)
    html.style.setProperty('--brand-d', D.brandDark || D.brand)
  }

  /* ── Words ──────────────────────────────────────────────────────────── */
  const STRINGS = {
    en: {
      loading: 'Loading…', viewSite: 'View the site', signOut: 'Sign out', theme: 'Theme', dashboard: 'Dashboard',
      setupTitle: 'Create the administrator account', setupText: 'This account runs {site}: settings, accounts, the assistant. It is the first and only one until you add others.',
      loginTitle: 'Sign in', loginText: 'to {site}', registerTitle: 'Create an account', registerText: 'to read {site}',
      username: 'Username', password: 'Password', confirm: 'Confirm the password', create: 'Create the account', signIn: 'Sign in',
      noAccount: 'No account yet?', register: 'Create one', haveAccount: 'Already have an account?', mismatch: 'The two passwords differ.',
      readerTitle: 'You are signed in', readerText: 'Your account can read the documentation. The dashboard is for editors and administrators.', toDocs: 'Go to the documentation',
      overview: 'Overview', feedback: 'Feedback', assistant: 'Assistant', access: 'Access', mcp: 'MCP', account: 'Account',
      admin: 'Administrator', editor: 'Editor', reader: 'Reader',
      overviewText: 'The state of the documentation at a glance.', pages: 'Pages', languages: 'Languages', translated: 'Translated into {lang}',
      outdatedMissing: '{outdated} outdated · {missing} missing', helpful: 'Found helpful', last30: 'last 30 days', votes: '{n} votes',
      on: 'On', off: 'Off', public: 'Public', private: 'Private', signupsOpen: 'sign-ups open', signupsClosed: 'sign-ups closed',
      build: 'Last build', builtIn: '{pages} pages in {ms} ms, at {time}', rebuild: 'Rebuild now', rebuilt: 'Site rebuilt', noWarnings: 'No warnings.', warnings: '{n} warnings',
      feedbackText: 'What readers said at the end of each page.', page: 'Page', lastVote: 'Last vote', comments: 'Comments', noFeedback: 'No votes yet. They appear here as readers answer "Was this page helpful?".', feedbackOff: 'Feedback is off. Switch it on under Access.',
      assistantText: 'Answers readers from the documentation, with links to the pages it used.', assistantOn: 'Answer readers’ questions', assistantOnText: 'Shows “Ask AI” on every page.',
      provider: 'Provider', baseUrl: 'Address', model: 'Model', apiKey: 'API key', keySaved: 'Saved. Type a new key to replace it.', keyNone: 'Paste the key', keyOptional: 'Not needed for this provider', removeKey: 'Remove the saved key',
      perHour: 'Questions per hour, per visitor', test: 'Test', testing: 'Testing…', testOk: 'Ready: answered in {ms} ms', save: 'Save', saved: 'Saved', keysNote: 'Keys are encrypted on the server and never sent to readers.',
      accessText: 'Who can read the documentation and who can have an account.', visibility: 'Who can read', visibilityText: 'Public: anyone, no account. Private: signed-in accounts only.',
      signups: 'Sign-ups', signupsText: 'Open lets anyone create an account. Closed: only you add accounts.', closed: 'Closed', open: 'Open', newRole: 'New accounts are', readerFeatures: 'Reader feedback', readerFeaturesText: 'Ask “Was this page helpful?” at the end of each page.',
      accounts: 'Accounts', role: 'Role', created: 'Created', remove: 'Remove', sure: 'Remove?', yes: 'Yes', no: 'No', addAccount: 'Add an account', add: 'Add', removed: 'Removed',
      mcpText: 'Let AI assistants read the documentation, and write it with a token.', mcpOn: 'MCP server', mcpOnText: 'Serve the documentation to MCP clients at the address below.',
      mcpPublic: 'Anyone can read through MCP', mcpPublicText: 'Only on a public site. Writing always needs a token.', endpoint: 'Address', connect: 'Connect a client',
      tokens: 'Access tokens', tokensText: 'A token lets an assistant write pages. It is shown once: copy it now.', name: 'Name', scope: 'Rights', write: 'Read and write', read: 'Read only',
      owner: 'Owner', lastUsed: 'Last used', never: 'never', revoke: 'Revoke', newToken: 'New token', tokenName: 'Claude Code on my laptop', createToken: 'Create the token', tokenOnce: 'Copy this token now. It will not be shown again.',
      copy: 'Copy', copied: 'Copied', noTokens: 'No tokens yet.',
      accountText: 'Your own account.', changePassword: 'Change the password', current: 'Current password', newPassword: 'New password', passwordChanged: 'Password changed. Other devices are signed out.',
      error: 'Something went wrong.', offline: 'The server cannot be reached.',
      err_credentials: 'Wrong username or password.', err_rate: 'Too many attempts. Wait a minute.', err_username: 'A username has 3 to 40 letters, digits, dots, dashes or underscores.',
      err_password: 'A password has at least 8 characters.', err_taken: 'This username is already taken.', 'err_last-admin': 'The site needs at least one administrator.',
      'err_setup-done': 'The administrator already exists. Sign in instead.', 'err_signups-closed': 'Sign-ups are closed on this site.', 'err_current-password': 'The current password is wrong.',
      err_forbidden: 'Your account cannot do this.', err_signin: 'Sign in first.',
      hint_ollama: 'Ollama Cloud, or http://localhost:11434 for a local Ollama (no key).', hint_fal: 'fal routes chat models through OpenRouter: use ids such as openai/gpt-4o-mini.', hint_custom: 'Any server with /v1/chat/completions: LM Studio, vLLM, LocalAI, Together…',
    },
    fr: {
      loading: 'Chargement…', viewSite: 'Voir le site', signOut: 'Se déconnecter', theme: 'Thème', dashboard: 'Tableau de bord',
      setupTitle: 'Créer le compte administrateur', setupText: 'Ce compte pilote {site} : réglages, comptes, assistant. C’est le premier et le seul tant que vous n’en ajoutez pas d’autres.',
      loginTitle: 'Se connecter', loginText: 'à {site}', registerTitle: 'Créer un compte', registerText: 'pour lire {site}',
      username: 'Nom d’utilisateur', password: 'Mot de passe', confirm: 'Confirmez le mot de passe', create: 'Créer le compte', signIn: 'Se connecter',
      noAccount: 'Pas encore de compte ?', register: 'En créer un', haveAccount: 'Déjà un compte ?', mismatch: 'Les deux mots de passe diffèrent.',
      readerTitle: 'Vous êtes connecté', readerText: 'Votre compte peut lire la documentation. Le tableau de bord est réservé aux rédacteurs et aux administrateurs.', toDocs: 'Aller à la documentation',
      overview: 'Vue d’ensemble', feedback: 'Avis', assistant: 'Assistant', access: 'Accès', mcp: 'MCP', account: 'Compte',
      admin: 'Administrateur', editor: 'Rédacteur', reader: 'Lecteur',
      overviewText: 'L’état de la documentation en un coup d’œil.', pages: 'Pages', languages: 'Langues', translated: 'Traduit en {lang}',
      outdatedMissing: '{outdated} en retard · {missing} manquantes', helpful: 'Jugées utiles', last30: '30 derniers jours', votes: '{n} votes',
      on: 'Activé', off: 'Désactivé', public: 'Publique', private: 'Privée', signupsOpen: 'inscriptions ouvertes', signupsClosed: 'inscriptions fermées',
      build: 'Dernière construction', builtIn: '{pages} pages en {ms} ms, à {time}', rebuild: 'Reconstruire', rebuilt: 'Site reconstruit', noWarnings: 'Aucun avertissement.', warnings: '{n} avertissements',
      feedbackText: 'Ce que les lecteurs ont répondu en bas de chaque page.', page: 'Page', lastVote: 'Dernier vote', comments: 'Commentaires', noFeedback: 'Pas encore de votes. Ils apparaissent ici quand les lecteurs répondent à « Cette page vous a-t-elle aidé ? ».', feedbackOff: 'Les avis sont désactivés. Activez-les dans Accès.',
      assistantText: 'Répond aux lecteurs à partir de la documentation, avec des liens vers les pages utilisées.', assistantOn: 'Répondre aux questions des lecteurs', assistantOnText: 'Affiche « Demander à l’IA » sur chaque page.',
      provider: 'Fournisseur', baseUrl: 'Adresse', model: 'Modèle', apiKey: 'Clé d’API', keySaved: 'Enregistrée. Tapez une nouvelle clé pour la remplacer.', keyNone: 'Collez la clé', keyOptional: 'Inutile pour ce fournisseur', removeKey: 'Supprimer la clé enregistrée',
      perHour: 'Questions par heure et par visiteur', test: 'Tester', testing: 'Test…', testOk: 'Prêt : réponse en {ms} ms', save: 'Enregistrer', saved: 'Enregistré', keysNote: 'Les clés sont chiffrées sur le serveur et ne sont jamais envoyées aux lecteurs.',
      accessText: 'Qui peut lire la documentation, et qui peut avoir un compte.', visibility: 'Qui peut lire', visibilityText: 'Publique : tout le monde, sans compte. Privée : seulement les comptes connectés.',
      signups: 'Inscriptions', signupsText: 'Ouvertes : tout le monde peut créer un compte. Fermées : vous seul ajoutez les comptes.', closed: 'Fermées', open: 'Ouvertes', newRole: 'Les nouveaux comptes sont', readerFeatures: 'Avis des lecteurs', readerFeaturesText: 'Demander « Cette page vous a-t-elle aidé ? » en bas de chaque page.',
      accounts: 'Comptes', role: 'Rôle', created: 'Créé le', remove: 'Supprimer', sure: 'Supprimer ?', yes: 'Oui', no: 'Non', addAccount: 'Ajouter un compte', add: 'Ajouter', removed: 'Supprimé',
      mcpText: 'Permettre aux assistants IA de lire la documentation, et de l’écrire avec un jeton.', mcpOn: 'Serveur MCP', mcpOnText: 'Servir la documentation aux clients MCP à l’adresse ci-dessous.',
      mcpPublic: 'Tout le monde peut lire par MCP', mcpPublicText: 'Seulement sur un site public. Écrire demande toujours un jeton.', endpoint: 'Adresse', connect: 'Connecter un client',
      tokens: 'Jetons d’accès', tokensText: 'Un jeton permet à un assistant d’écrire des pages. Il n’est affiché qu’une fois : copiez-le tout de suite.', name: 'Nom', scope: 'Droits', write: 'Lecture et écriture', read: 'Lecture seule',
      owner: 'Propriétaire', lastUsed: 'Dernière utilisation', never: 'jamais', revoke: 'Révoquer', newToken: 'Nouveau jeton', tokenName: 'Claude Code sur mon portable', createToken: 'Créer le jeton', tokenOnce: 'Copiez ce jeton maintenant. Il ne sera plus affiché.',
      copy: 'Copier', copied: 'Copié', noTokens: 'Aucun jeton pour l’instant.',
      accountText: 'Votre propre compte.', changePassword: 'Changer le mot de passe', current: 'Mot de passe actuel', newPassword: 'Nouveau mot de passe', passwordChanged: 'Mot de passe changé. Les autres appareils sont déconnectés.',
      error: 'Une erreur est survenue.', offline: 'Le serveur est injoignable.',
      err_credentials: 'Nom d’utilisateur ou mot de passe incorrect.', err_rate: 'Trop de tentatives. Patientez une minute.', err_username: 'Un nom d’utilisateur contient de 3 à 40 lettres, chiffres, points, tirets ou soulignés.',
      err_password: 'Un mot de passe contient au moins 8 caractères.', err_taken: 'Ce nom d’utilisateur est déjà pris.', 'err_last-admin': 'Le site doit garder au moins un administrateur.',
      'err_setup-done': 'L’administrateur existe déjà. Connectez-vous.', 'err_signups-closed': 'Les inscriptions sont fermées sur ce site.', 'err_current-password': 'Le mot de passe actuel est incorrect.',
      err_forbidden: 'Votre compte ne peut pas faire cela.', err_signin: 'Connectez-vous d’abord.',
      hint_ollama: 'Ollama Cloud, ou http://localhost:11434 pour un Ollama local (sans clé).', hint_fal: 'fal passe les modèles de chat par OpenRouter : utilisez des identifiants comme openai/gpt-4o-mini.', hint_custom: 'Tout serveur avec /v1/chat/completions : LM Studio, vLLM, LocalAI, Together…',
    },
  }
  const lang = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('lumy.lang'))
      if (saved && STRINGS[saved]) return saved
    } catch {}
    const pref = (navigator.language || D.defaultLanguage || 'en').slice(0, 2)
    return STRINGS[pref] ? pref : STRINGS[D.defaultLanguage] ? D.defaultLanguage : 'en'
  })()
  html.lang = lang
  const t = (k, vars = {}) => String(STRINGS[lang][k] ?? STRINGS.en[k] ?? k).replace(/\{(\w+)\}/g, (m, v) => (v in vars ? vars[v] : m))
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const date = (iso, withTime) => {
    if (!iso) return '—'
    try {
      return new Intl.DateTimeFormat(lang, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(iso))
    } catch {
      return iso.slice(0, 10)
    }
  }

  const ICONS = {
    home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    thumb: '<path d="M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  }
  const icon = (n) => `<svg class="ad-i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`

  /* ── Talking to the server ──────────────────────────────────────────── */
  async function api(path, { method = 'GET', body } = {}) {
    let res
    try {
      res = await fetch(API + path, {
        method,
        credentials: 'same-origin',
        headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      })
    } catch {
      throw new Error(t('offline'))
    }
    const text = await res.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {}
    if (!res.ok) throw Object.assign(new Error((data.code && STRINGS[lang]['err_' + data.code]) || data.error || t('error')), { status: res.status, code: data.code })
    return data
  }

  const toastEl = d.getElementById('ad-toast')
  let toastTimer
  function toast(msg, bad) {
    toastEl.textContent = msg
    toastEl.classList.toggle('is-bad', Boolean(bad))
    toastEl.classList.add('is-open')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('is-open'), 2600)
  }
  function copy(text) {
    const done = () => toast(t('copied'))
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(done, () => fallback())
    fallback()
    function fallback() {
      const ta = d.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0'
      d.body.appendChild(ta)
      ta.select()
      try {
        d.execCommand('copy')
        done()
      } catch {}
      ta.remove()
    }
  }
  async function busy(button, fn) {
    button?.classList.add('is-busy')
    button && (button.disabled = true)
    try {
      return await fn()
    } finally {
      button?.classList.remove('is-busy')
      button && (button.disabled = false)
    }
  }

  function themeNow() {
    const v = html.getAttribute('data-theme')
    return v === 'dark' || v === 'light' ? v : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  function toggleTheme(btn) {
    const next = themeNow() === 'dark' ? 'light' : 'dark'
    const apply = () => {
      html.setAttribute('data-theme', next)
      try {
        localStorage.setItem('lumy.theme', JSON.stringify(next))
      } catch {}
      btn.innerHTML = icon(next === 'dark' ? 'sun' : 'moon')
    }
    if (!d.startViewTransition || reduced.matches) return apply()
    const r = btn.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    d.startViewTransition(apply).ready.then(() => {
      html.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' })
    })
  }

  /* ── Screens without the dashboard frame ────────────────────────────── */
  const logo = D.logo || `${D.base}_lumy/app/lumy.svg`
  function authScreen({ title, text, fields, submit, foot = '', id }) {
    app.innerHTML = `<main class="ad-auth"><form class="ad-auth-card ad-form" data-form="${id}" novalidate>
      <img class="ad-auth-logo" src="${esc(logo)}" alt="">
      <div><h1>${esc(title)}</h1><p class="ad-muted" style="margin:0">${esc(text)}</p></div>
      ${fields}
      <p class="ad-error" hidden></p>
      <button class="ad-btn ad-btn-primary" type="submit">${esc(submit)}</button>
      ${foot ? `<p class="ad-auth-foot">${foot}</p>` : ''}
    </form></main>`
    app.querySelector('input')?.focus()
  }
  const field = (name, label, type = 'text', extra = '') =>
    `<label class="ad-field">${esc(label)}<input class="ad-input" name="${name}" type="${type}" ${extra}></label>`

  function nextUrl(user) {
    const next = new URLSearchParams(location.search).get('next')
    if (next && next.startsWith(D.base) && !next.startsWith('//')) return next
    return user?.role === 'reader' ? D.home : `${D.base}_lumy/admin`
  }
  function showError(form, message) {
    const p = form.querySelector('.ad-error')
    p.hidden = false
    p.textContent = message
    p.style.animation = 'none'
    void p.offsetWidth
    p.style.animation = ''
  }

  function renderSetup() {
    authScreen({
      id: 'setup',
      title: t('setupTitle'),
      text: t('setupText', { site: D.title }),
      fields: field('username', t('username'), 'text', 'autocomplete="username" required') + field('password', t('password'), 'password', 'autocomplete="new-password" minlength="8" required') + field('confirm', t('confirm'), 'password', 'autocomplete="new-password" required'),
      submit: t('create'),
    })
  }
  function renderLogin() {
    authScreen({
      id: 'login',
      title: t('loginTitle'),
      text: t('loginText', { site: D.title }),
      fields: field('username', t('username'), 'text', 'autocomplete="username" required') + field('password', t('password'), 'password', 'autocomplete="current-password" required'),
      submit: t('signIn'),
      foot: `${state.info.registration ? `${esc(t('noAccount'))} <a href="${D.base}_lumy/register${location.search}">${esc(t('register'))}</a> · ` : ''}<a href="${esc(D.home)}">${esc(t('viewSite'))}</a>`,
    })
  }
  function renderRegister() {
    authScreen({
      id: 'register',
      title: t('registerTitle'),
      text: t('registerText', { site: D.title }),
      fields: field('username', t('username'), 'text', 'autocomplete="username" required') + field('password', t('password'), 'password', 'autocomplete="new-password" minlength="8" required') + field('confirm', t('confirm'), 'password', 'autocomplete="new-password" required'),
      submit: t('create'),
      foot: `${esc(t('haveAccount'))} <a href="${D.base}_lumy/login${location.search}">${esc(t('signIn'))}</a>`,
    })
  }
  function renderReader() {
    app.innerHTML = `<main class="ad-auth"><div class="ad-auth-card"><img class="ad-auth-logo" src="${esc(logo)}" alt=""><h1>${esc(t('readerTitle'))}</h1><p>${esc(t('readerText'))}</p><div class="ad-row"><a class="ad-btn ad-btn-primary" href="${esc(D.home)}">${esc(t('toDocs'))}</a><button class="ad-btn" type="button" data-act="sign-out">${esc(t('signOut'))}</button></div></div></main>`
  }

  /* ── The dashboard frame ────────────────────────────────────────────── */
  const SECTIONS = [
    { id: 'overview', icon: 'home', roles: ['admin', 'editor'] },
    { id: 'feedback', icon: 'thumb', roles: ['admin', 'editor'] },
    { id: 'assistant', icon: 'sparkles', roles: ['admin'] },
    { id: 'access', icon: 'lock', roles: ['admin'] },
    { id: 'mcp', icon: 'plug', roles: ['admin', 'editor'] },
    { id: 'account', icon: 'user', roles: ['admin', 'editor'] },
  ]
  const state = { info: null, me: null, settings: null, draft: null }
  const allowed = () => SECTIONS.filter((s) => s.roles.includes(state.me.role))

  function renderShell() {
    const me = state.me
    app.innerHTML = `<div class="ad-shell">
      <aside class="ad-side">
        <a class="ad-brand" href="${esc(D.home)}"><img src="${esc(logo)}" alt=""><span>${esc(D.title)}<small>${esc(t('dashboard'))}</small></span></a>
        <nav class="ad-nav" aria-label="${esc(t('dashboard'))}"><span class="ad-nav-ind" aria-hidden="true"></span>${allowed()
          .map((s) => `<a href="#${s.id}" data-section="${s.id}">${icon(s.icon)}<span>${esc(t(s.id))}</span></a>`)
          .join('')}</nav>
        <div class="ad-side-foot">
          <div class="ad-me"><span class="ad-avatar">${esc(me.username.slice(0, 1).toUpperCase())}</span><div><strong>${esc(me.username)}</strong><span>${esc(t(me.role))}</span></div></div>
          <div class="ad-side-actions">
            <a class="ad-btn ad-btn-sm" href="${esc(D.home)}" title="${esc(t('viewSite'))}">${icon('external')}<span class="ad-label">${esc(t('viewSite'))}</span></a>
            <button class="ad-btn ad-btn-sm" type="button" data-act="theme" title="${esc(t('theme'))}" aria-label="${esc(t('theme'))}">${icon(themeNow() === 'dark' ? 'sun' : 'moon')}</button>
            <button class="ad-btn ad-btn-sm" type="button" data-act="sign-out" title="${esc(t('signOut'))}" aria-label="${esc(t('signOut'))}">${icon('logout')}</button>
          </div>
        </div>
      </aside>
      <main class="ad-main" id="ad-main"></main>
    </div>`
    showSection()
  }

  function placeNavIndicator() {
    const nav = app.querySelector('.ad-nav')
    const current = nav?.querySelector('[aria-current="page"]')
    const ind = nav?.querySelector('.ad-nav-ind')
    if (!current || !ind) return
    const horizontal = getComputedStyle(nav).display === 'flex'
    ind.style.width = horizontal ? current.offsetWidth + 'px' : ''
    ind.style.height = horizontal ? '' : current.offsetHeight + 'px'
    ind.style.transform = horizontal ? `translateX(${current.offsetLeft - nav.scrollLeft}px)` : `translateY(${current.offsetTop}px)`
    if (horizontal) current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  addEventListener('resize', placeNavIndicator)

  async function showSection() {
    const list = allowed()
    const id = list.some((s) => s.id === location.hash.slice(1)) ? location.hash.slice(1) : list[0].id
    app.querySelectorAll('.ad-nav a').forEach((a) => (a.dataset.section === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')))
    placeNavIndicator()
    const main = d.getElementById('ad-main')
    main.innerHTML = `<div class="ad-loading" style="height:40vh"><span></span></div>`
    try {
      main.innerHTML = `<div class="ad-view">${await VIEWS[id]()}</div>`
      afterRender(main)
    } catch (err) {
      if (err.status === 401) return location.reload()
      main.innerHTML = `<div class="ad-view"><div class="ad-empty">${esc(err.message)}</div></div>`
    }
  }
  addEventListener('hashchange', () => state.me && state.me.role !== 'reader' && showSection())

  function afterRender(root) {
    root.querySelectorAll('.ad-seg').forEach(placeSeg)
    root.querySelectorAll('.ad-card, .ad-stat, .ad-comment').forEach((el, i) => el.style.setProperty('--i', i))
  }
  function placeSeg(seg) {
    const on = seg.querySelector('[aria-pressed="true"]')
    const ind = seg.querySelector('.ad-seg-ind')
    if (!on || !ind) return
    ind.style.width = on.offsetWidth + 'px'
    ind.style.transform = `translateX(${on.offsetLeft}px)`
  }
  const seg = (name, value, options) =>
    `<div class="ad-seg" role="group" data-seg="${name}"><span class="ad-seg-ind"></span>${options
      .map(([v, label]) => `<button type="button" data-value="${v}" aria-pressed="${v === value}">${esc(label)}</button>`)
      .join('')}</div>`
  const sw = (name, checked, title, text) =>
    `<label class="ad-switch"><input type="checkbox" data-switch="${name}" ${checked ? 'checked' : ''}><span class="ad-switch-track"></span><span class="ad-switch-text"><strong>${esc(title)}</strong><span>${esc(text)}</span></span></label>`
  const head = (id, text, action = '') => `<header class="ad-head"><div><h1>${esc(t(id))}</h1><p>${esc(text)}</p></div>${action}</header>`

  /* ── Sections ───────────────────────────────────────────────────────── */
  const VIEWS = {
    async overview() {
      const o = await api('admin/overview')
      const stats = []
      stats.push(`<div class="ad-stat"><span>${esc(t('pages'))}</span><strong>${o.build?.pages ?? '—'}</strong><small>${esc(o.languages.map((l) => l.toUpperCase()).join(' · '))}</small></div>`)
      for (const [code, r] of Object.entries(o.translations || {})) {
        const total = r.current.length + r.outdated.length + r.unverified.length + r.missing.length
        const pct = total ? Math.round((r.current.length / total) * 100) : 0
        stats.push(`<div class="ad-stat"><span>${esc(t('translated', { lang: code.toUpperCase() }))}</span><strong>${r.current.length}/${total}</strong><small>${esc(t('outdatedMissing', { outdated: r.outdated.length, missing: r.missing.length }))}</small><div class="ad-bar"><i style="width:${pct}%"></i></div></div>`)
      }
      const votes = o.feedback.yes + o.feedback.no
      const helpful = votes ? Math.round((o.feedback.yes / votes) * 100) : 0
      stats.push(`<div class="ad-stat"><span>${esc(t('helpful'))} · ${esc(t('last30'))}</span><strong>${votes ? helpful + ' %' : '—'}</strong><small>${esc(t('votes', { n: votes }))}</small>${votes ? `<div class="ad-bar"><i style="width:${helpful}%"></i></div>` : ''}</div>`)
      stats.push(`<div class="ad-stat"><span>${esc(t('assistant'))}</span><strong style="font-size:18px">${esc(o.assistant.enabled ? t('on') : t('off'))}</strong><small>${esc(o.assistant.provider || '—')}</small></div>`)
      stats.push(`<div class="ad-stat"><span>${esc(t('access'))}</span><strong style="font-size:18px">${esc(t(o.access))}</strong><small>${esc(o.registration === 'open' ? t('signupsOpen') : t('signupsClosed'))}</small></div>`)
      const w = o.build?.warnings || []
      const build = o.build
        ? `<p class="ad-muted" style="margin:0 0 12px">${esc(t('builtIn', { pages: o.build.pages, ms: o.build.ms, time: date(o.build.at, true) }))}</p>${
            w.length
              ? `<div class="ad-table-wrap"><table class="ad-table"><tbody>${w.slice(0, 20).map((x) => `<tr><td><code>${esc(x.file)}</code></td><td>${esc(x.message)}</td></tr>`).join('')}</tbody></table></div>`
              : `<p style="margin:0"><span class="ad-pill ad-pill-ok">${icon('check')}${esc(t('noWarnings'))}</span></p>`
          }`
        : ''
      return `${head('overview', t('overviewText'))}<div class="ad-grid">${stats.join('')}</div>
        <section class="ad-card"><div class="ad-card-row"><h2 style="margin:0">${esc(t('build'))}${w.length ? ` <span class="ad-pill ad-pill-warn">${esc(t('warnings', { n: w.length }))}</span>` : ''}</h2><button class="ad-btn ad-btn-sm" type="button" data-act="rebuild">${icon('refresh')}${esc(t('rebuild'))}</button></div><hr class="ad-sep">${build}</section>`
    },

    async feedback() {
      const f = await api('admin/feedback')
      const settingsOff = state.me.role === 'admin' && !(await loadSettings()).feedback
      const rows = f.pages
        .map((p) => {
          const total = p.yes + p.no
          const pct = total ? Math.round((p.yes / total) * 100) : 0
          return `<tr><td><code>${esc(p.page || 'index')}</code> <span class="ad-pill">${esc(p.lang.toUpperCase())}</span></td><td class="ad-num">${p.yes}</td><td class="ad-num">${p.no}</td><td><div class="ad-helpful"><div class="ad-bar"><i style="width:${pct}%"></i></div><span class="ad-muted">${pct} %</span></div></td><td class="ad-muted">${esc(date(p.last))}</td></tr>`
        })
        .join('')
      const comments = f.comments
        .map((c) => `<article class="ad-comment"><header><code>${esc(c.page || 'index')}</code><span class="ad-pill ${c.value === 'yes' ? 'ad-pill-ok' : 'ad-pill-bad'}">${c.value === 'yes' ? '👍' : '👎'}</span><span>${esc(date(c.at, true))}</span></header><p>${esc(c.comment)}</p></article>`)
        .join('')
      return `${head('feedback', t('feedbackText'))}
        ${settingsOff ? `<div class="ad-empty" style="margin-bottom:16px">${esc(t('feedbackOff'))}</div>` : ''}
        <section class="ad-card">${
          rows
            ? `<div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>${esc(t('page'))}</th><th class="ad-num">👍</th><th class="ad-num">👎</th><th>${esc(t('helpful'))}</th><th>${esc(t('lastVote'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`
            : `<div class="ad-empty">${esc(t('noFeedback'))}</div>`
        }</section>
        ${comments ? `<section class="ad-card"><h2>${esc(t('comments'))}</h2><p></p><div class="ad-comments">${comments}</div></section>` : ''}`
    },

    async assistant() {
      const s = await loadSettings(true)
      state.draft = JSON.parse(JSON.stringify(s.assistant))
      return `${head('assistant', t('assistantText'))}${assistantBody(s)}`
    },

    async access() {
      const s = await loadSettings(true)
      const { users } = await api('admin/users')
      const roleOptions = (current) => ['admin', 'editor', 'reader'].map((r) => `<option value="${r}" ${r === current ? 'selected' : ''}>${esc(t(r))}</option>`).join('')
      const rows = users
        .map((u) => `<tr data-user="${u.id}"><td><strong>${esc(u.username)}</strong>${u.id === state.me.id ? ' <span class="ad-pill">✓</span>' : ''}</td><td><select class="ad-select" data-role="${u.id}" style="height:32px;width:auto" aria-label="${esc(t('role'))}">${roleOptions(u.role)}</select></td><td class="ad-muted">${esc(date(u.createdAt))}</td><td class="ad-num"><span class="ad-del">${u.id === state.me.id ? '' : `<button class="ad-btn ad-btn-sm ad-btn-danger" type="button" data-act="ask-remove">${esc(t('remove'))}</button>`}</span></td></tr>`)
        .join('')
      return `${head('access', t('accessText'))}
        <section class="ad-card"><h2>${esc(t('visibility'))}</h2><p>${esc(t('visibilityText'))}</p>${seg('access', s.access, [['public', t('public')], ['private', t('private')]])}</section>
        <section class="ad-card"><h2>${esc(t('signups'))}</h2><p>${esc(t('signupsText'))}</p><div class="ad-row" style="align-items:center">${seg('registration', s.registration, [['closed', t('closed')], ['open', t('open')]])}<span class="ad-muted" style="font-size:13px">${esc(t('newRole'))}</span>${seg('defaultRole', s.defaultRole, [['reader', t('reader')], ['editor', t('editor')]])}</div></section>
        <section class="ad-card">${sw('feedback', s.feedback, t('readerFeatures'), t('readerFeaturesText'))}</section>
        <section class="ad-card"><h2>${esc(t('accounts'))}</h2><p></p>
          <div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>${esc(t('username'))}</th><th>${esc(t('role'))}</th><th>${esc(t('created'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
          <hr class="ad-sep"><h2 style="font-size:14.5px;margin:0 0 12px">${esc(t('addAccount'))}</h2>
          <form class="ad-row" data-form="add-user" novalidate>${field('username', t('username'), 'text', 'autocomplete="off"')}${field('password', t('password'), 'password', 'autocomplete="new-password"')}<label class="ad-field" style="flex:0 1 160px">${esc(t('role'))}<select class="ad-select" name="role">${roleOptions('editor')}</select></label><button class="ad-btn ad-btn-primary" type="submit">${esc(t('add'))}</button><p class="ad-error" hidden style="flex-basis:100%"></p></form>
        </section>`
    },

    async mcp() {
      const { tokens, url } = await api('admin/tokens')
      const s = state.me.role === 'admin' ? await loadSettings(true) : null
      const abs = new URL(url, location.href).href
      const snippet = `claude mcp add --transport http ${slug(D.title)} ${abs} --header "Authorization: Bearer <token>"`
      const rows = tokens
        .map((tk) => `<tr><td><strong>${esc(tk.name)}</strong></td><td><span class="ad-pill">${esc(tk.scope === 'read' ? t('read') : t('write'))}</span></td><td>${esc(tk.owner)}</td><td class="ad-muted">${esc(date(tk.createdAt))}</td><td class="ad-muted">${esc(tk.lastUsed ? date(tk.lastUsed, true) : t('never'))}</td><td class="ad-num"><button class="ad-btn ad-btn-sm ad-btn-danger" type="button" data-act="revoke" data-id="${tk.id}">${esc(t('revoke'))}</button></td></tr>`)
        .join('')
      return `${head('mcp', t('mcpText'))}
        ${s ? `<section class="ad-card" style="display:grid;gap:14px">${sw('mcp.enabled', s.mcp.enabled, t('mcpOn'), t('mcpOnText'))}${sw('mcp.publicRead', s.mcp.publicRead, t('mcpPublic'), t('mcpPublicText'))}</section>` : ''}
        <section class="ad-card"><h2>${esc(t('endpoint'))}</h2><p></p><div class="ad-secret" style="animation:none"><code>${esc(abs)}</code><button class="ad-btn ad-btn-sm" type="button" data-copy="${esc(abs)}">${icon('copy')}${esc(t('copy'))}</button></div>
          <hr class="ad-sep"><h2 style="font-size:14.5px;margin:0 0 10px">${esc(t('connect'))}</h2><pre class="ad-pre">${esc(snippet)}</pre></section>
        <section class="ad-card"><h2>${esc(t('tokens'))}</h2><p>${esc(t('tokensText'))}</p>
          <div id="ad-new-token"></div>
          ${rows ? `<div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>${esc(t('name'))}</th><th>${esc(t('scope'))}</th><th>${esc(t('owner'))}</th><th>${esc(t('created'))}</th><th>${esc(t('lastUsed'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="ad-empty">${esc(t('noTokens'))}</div>`}
          <hr class="ad-sep"><h2 style="font-size:14.5px;margin:0 0 12px">${esc(t('newToken'))}</h2>
          <form class="ad-row" data-form="token" novalidate>${field('name', t('name'), 'text', `placeholder="${esc(t('tokenName'))}"`)}<div class="ad-field" style="flex:0 0 auto">${esc(t('scope'))}${seg('scope', 'write', [['write', t('write')], ['read', t('read')]])}</div><button class="ad-btn ad-btn-primary" type="submit">${esc(t('createToken'))}</button></form>
        </section>`
    },

    async account() {
      return `${head('account', t('accountText'))}
        <section class="ad-card"><h2>${esc(t('changePassword'))}</h2><p></p>
          <form class="ad-form" data-form="password" novalidate style="max-width:420px">${field('current', t('current'), 'password', 'autocomplete="current-password"')}${field('password', t('newPassword'), 'password', 'autocomplete="new-password"')}${field('confirm', t('confirm'), 'password', 'autocomplete="new-password"')}<p class="ad-error" hidden></p><div><button class="ad-btn ad-btn-primary" type="submit">${esc(t('save'))}</button></div></form>
        </section>
        <section class="ad-card"><div class="ad-card-row"><div><h2 style="margin:0">${esc(state.me.username)}</h2><span class="ad-muted">${esc(t(state.me.role))}</span></div><button class="ad-btn" type="button" data-act="sign-out">${icon('logout')}${esc(t('signOut'))}</button></div></section>`
    },
  }

  const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'docs'

  async function loadSettings(fresh) {
    if (!state.settings || fresh) state.settings = await api('admin/settings')
    return state.settings
  }

  function assistantBody(s) {
    const a = state.draft
    const def = s.catalog.find((p) => p.id === a.provider)
    const cards = s.catalog
      .map((p) => `<button class="ad-provider" type="button" data-provider="${p.id}" aria-pressed="${p.id === a.provider}"><strong>${esc(p.label)}</strong><span>${esc(a.providers[p.id]?.model || p.model || '—')}</span>${a.providers[p.id]?.hasKey ? '<em title="✓"></em>' : ''}</button>`)
      .join('')
    const cfg = def ? a.providers[def.id] : null
    const keyPlaceholder = def?.keyOptional && !cfg?.hasKey ? t('keyOptional') : cfg?.hasKey ? t('keySaved') : t('keyNone')
    const fields = def
      ? `<div class="ad-form">
          ${def.hint ? `<p class="ad-muted" style="margin:0;font-size:13px">${esc(STRINGS[lang]['hint_' + def.id] || def.hint)}</p>` : ''}
          <div class="ad-row">
            <label class="ad-field">${esc(t('baseUrl'))}<input class="ad-input ad-mono" data-draft="baseUrl" value="${esc(cfg.baseUrl)}" placeholder="${esc(def.baseUrl || 'https://…')}" spellcheck="false"></label>
            <label class="ad-field">${esc(t('model'))}<input class="ad-input ad-mono" data-draft="model" value="${esc(cfg.model)}" placeholder="${esc(def.model)}" spellcheck="false"></label>
          </div>
          <label class="ad-field">${esc(t('apiKey'))}<input class="ad-input ad-mono" data-draft="apiKey" type="password" autocomplete="off" placeholder="${esc(keyPlaceholder)}" spellcheck="false"></label>
          ${cfg.hasKey ? `<div><button class="ad-link" type="button" data-act="remove-key">${esc(t('removeKey'))}</button></div>` : ''}
          <div class="ad-row" style="align-items:center"><button class="ad-btn" type="button" data-act="test">${esc(t('test'))}</button><p class="ad-test" id="ad-test" hidden></p></div>
        </div>`
      : ''
    return `<section class="ad-card">${sw('assistant.enabled', a.enabled, t('assistantOn'), t('assistantOnText'))}</section>
      <section class="ad-card"><h2>${esc(t('provider'))}</h2><p>${esc(t('keysNote'))}</p><div class="ad-providers">${cards}</div>${fields}</section>
      <section class="ad-card"><div class="ad-row"><label class="ad-field" style="flex:0 1 260px">${esc(t('perHour'))}<input class="ad-input" type="number" min="1" max="1000" data-draft-root="perHour" value="${esc(a.perHour)}"></label><span style="flex:1"></span><button class="ad-btn ad-btn-primary" type="button" data-act="save-assistant">${esc(t('save'))}</button></div></section>`
  }

  function redrawAssistant() {
    const view = app.querySelector('.ad-view')
    view.innerHTML = `${head('assistant', t('assistantText'))}${assistantBody(state.settings)}`
    afterRender(view)
  }

  async function saveSettings(patch, quiet) {
    state.settings = await api('admin/settings', { method: 'PUT', body: patch })
    if (!quiet) toast(t('saved'))
    return state.settings
  }

  /* ── Events ─────────────────────────────────────────────────────────── */
  app.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act], [data-copy], [data-provider], .ad-seg button, .ad-nav a')
    if (!el) return
    if (el.matches('.ad-nav a')) return // the hash change does the rest
    if (el.dataset.copy) return copy(el.dataset.copy)

    if (el.matches('.ad-seg button')) {
      const group = el.closest('.ad-seg')
      group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === el)))
      placeSeg(group)
      const name = group.dataset.seg
      if (['access', 'registration', 'defaultRole'].includes(name)) {
        try {
          await saveSettings({ [name]: el.dataset.value })
        } catch (err) {
          toast(err.message, true)
        }
      }
      return
    }

    if (el.dataset.provider) {
      state.draft.provider = el.dataset.provider
      redrawAssistant()
      return
    }

    const act = el.dataset.act
    try {
      if (act === 'theme') return toggleTheme(el)
      if (act === 'sign-out') {
        await api('auth/logout', { method: 'POST' })
        location.href = D.home
        return
      }
      if (act === 'rebuild') {
        await busy(el, () => api('admin/rebuild', { method: 'POST' }))
        toast(t('rebuilt'))
        return showSection()
      }
      if (act === 'test') {
        const out = d.getElementById('ad-test')
        const a = state.draft
        const cfg = a.providers[a.provider]
        const r = await busy(el, () => api('admin/assistant/test', { method: 'POST', body: { provider: a.provider, baseUrl: cfg.baseUrl, model: cfg.model, apiKey: cfg.newKey || undefined } }))
        out.hidden = false
        out.className = `ad-test ${r.ok ? 'ok' : 'bad'}`
        out.innerHTML = r.ok ? `${icon('check')}${esc(t('testOk', { ms: r.ms }))}` : `${icon('x')}${esc(r.error)}`
        return
      }
      if (act === 'remove-key') {
        const id = state.draft.provider
        await saveSettings({ assistant: { providers: { [id]: { apiKey: null } } } })
        state.draft = JSON.parse(JSON.stringify(state.settings.assistant))
        return redrawAssistant()
      }
      if (act === 'save-assistant') {
        const a = state.draft
        const providers = {}
        for (const [id, p] of Object.entries(a.providers)) providers[id] = { baseUrl: p.baseUrl, model: p.model, ...(p.newKey ? { apiKey: p.newKey } : {}) }
        await busy(el, () => saveSettings({ assistant: { enabled: a.enabled, provider: a.provider, perHour: Number(a.perHour), providers } }))
        state.draft = JSON.parse(JSON.stringify(state.settings.assistant))
        return redrawAssistant()
      }
      if (act === 'ask-remove') {
        const cell = el.closest('.ad-del')
        cell.innerHTML = `<span class="ad-confirm">${esc(t('sure'))} <button class="ad-btn ad-btn-sm ad-btn-danger" type="button" data-act="remove-user">${esc(t('yes'))}</button><button class="ad-btn ad-btn-sm" type="button" data-act="keep-user">${esc(t('no'))}</button></span>`
        return
      }
      if (act === 'keep-user') return showSection()
      if (act === 'remove-user') {
        const row = el.closest('tr')
        await api(`admin/users/${row.dataset.user}`, { method: 'DELETE' })
        row.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(12px)' }], { duration: reduced.matches ? 1 : 220 }).finished.then(() => row.remove())
        toast(t('removed'))
        return
      }
      if (act === 'revoke') {
        await api(`admin/tokens/${el.dataset.id}`, { method: 'DELETE' })
        toast(t('removed'))
        return showSection()
      }
    } catch (err) {
      toast(err.message, true)
    }
  })

  app.addEventListener('input', (e) => {
    const el = e.target
    if (!state.draft) return
    if (el.dataset.draft) {
      const p = state.draft.providers[state.draft.provider]
      if (el.dataset.draft === 'apiKey') p.newKey = el.value.trim()
      else p[el.dataset.draft] = el.value
    }
    if (el.dataset.draftRoot) state.draft[el.dataset.draftRoot] = el.value
  })

  app.addEventListener('change', async (e) => {
    const el = e.target
    try {
      if (el.dataset.switch === 'assistant.enabled') {
        state.draft.enabled = el.checked
        return
      }
      if (el.dataset.switch === 'feedback') return void (await saveSettings({ feedback: el.checked }))
      if (el.dataset.switch?.startsWith('mcp.')) return void (await saveSettings({ mcp: { [el.dataset.switch.slice(4)]: el.checked } }))
      if (el.dataset.role) {
        await api(`admin/users/${el.dataset.role}`, { method: 'PATCH', body: { role: el.value } })
        return toast(t('saved'))
      }
    } catch (err) {
      toast(err.message, true)
      if (el.type === 'checkbox') el.checked = !el.checked
      if (el.dataset.role) showSection()
    }
  })

  app.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-form]')
    if (!form) return
    e.preventDefault()
    const data = Object.fromEntries(new FormData(form))
    const button = form.querySelector('[type="submit"]')
    const kind = form.dataset.form
    form.querySelectorAll('.is-bad').forEach((i) => i.classList.remove('is-bad'))
    try {
      if ((kind === 'setup' || kind === 'register' || kind === 'password') && data.password !== data.confirm) {
        form.querySelector('[name="confirm"]').classList.add('is-bad')
        return showError(form, t('mismatch'))
      }
      if (kind === 'setup' || kind === 'login' || kind === 'register') {
        const route = kind === 'setup' ? 'auth/setup' : kind === 'login' ? 'auth/login' : 'auth/register'
        const { user } = await busy(button, () => api(route, { method: 'POST', body: { username: data.username, password: data.password } }))
        location.href = nextUrl(user)
        return
      }
      if (kind === 'password') {
        await busy(button, () => api('account/password', { method: 'POST', body: { current: data.current, password: data.password } }))
        form.reset()
        return toast(t('passwordChanged'))
      }
      if (kind === 'add-user') {
        await busy(button, () => api('admin/users', { method: 'POST', body: data }))
        toast(t('saved'))
        return showSection()
      }
      if (kind === 'token') {
        const scope = form.querySelector('[data-seg="scope"] [aria-pressed="true"]')?.dataset.value || 'write'
        const { token } = await busy(button, () => api('admin/tokens', { method: 'POST', body: { name: data.name || t('tokenName'), scope } }))
        await showSection()
        const box = d.getElementById('ad-new-token')
        box.innerHTML = `<p class="ad-muted" style="margin:0 0 8px">${esc(t('tokenOnce'))}</p><div class="ad-secret"><code>${esc(token.token)}</code><button class="ad-btn ad-btn-sm" type="button" data-copy="${esc(token.token)}">${icon('copy')}${esc(t('copy'))}</button></div><hr class="ad-sep">`
        return
      }
    } catch (err) {
      const p = form.querySelector('.ad-error')
      if (p) showError(form, err.message)
      else toast(err.message, true)
      if (/password|mot de passe/i.test(err.message)) form.querySelector('[name="password"]')?.classList.add('is-bad')
    }
  })

  /* ── Start ──────────────────────────────────────────────────────────── */
  ;(async () => {
    try {
      state.info = await api('me')
    } catch (err) {
      app.innerHTML = `<main class="ad-auth"><div class="ad-auth-card"><h1>Lumy</h1><p>${esc(err.message)}</p></div></main>`
      return
    }
    state.me = state.info.user
    if (state.info.setup) return renderSetup()
    if (!state.me) return D.view === 'register' && state.info.registration ? renderRegister() : renderLogin()
    if (D.view !== 'admin') {
      location.replace(nextUrl(state.me))
      return
    }
    if (state.me.role === 'reader') return renderReader()
    renderShell()
  })()
})()
