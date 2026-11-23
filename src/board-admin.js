/**
 * The admin in Kosmy Board (protocol kosmy.board-admin.v1).
 *
 * Kosmy Board's server calls three addresses under the site's base path:
 *   GET  {base}api/kosmy-board/admin            the app and its sections
 *   GET  {base}api/kosmy-board/admin/{section}  one section
 *   POST {base}api/kosmy-board/admin/{section}  an action in that section
 * with a short-lived JWT signed by Kosmy Board's OpenID Connect key. Lumy
 * describes its dashboard (notices, figures, forms, tables, buttons); Kosmy
 * Board draws it and sends the person's actions back, which Lumy checks and
 * runs through the same functions as its own dashboard.
 *
 * Kosmy Board only says who the person is (`sub`). The rights are Lumy's: the
 * `sub` must be linked to a Lumy account (the link made for sign-in), and that
 * account must be an administrator. Secrets already saved are never sent back.
 *
 * Spec: https://github.com/PetitOursManu/Kosmy-Board/blob/main/docs/admin-api.md
 */
import { ROLES } from './auth.js'
import { PROVIDERS, providerById, testProvider } from './providers.js'
import { activeProvider } from './settings.js'
import { pageUrl } from './content.js'

export const ADMIN_API = 'api/kosmy-board/admin'
export const PROTOCOL = 'kosmy.board-admin.v1'
const SECTION_ID = /^[a-z0-9-]{1,40}$/
const ACTION_ID = /^[A-Za-z0-9_.:-]{1,64}$/
const MAX_ROWS = 500

/* ── Words: the dashboard's, in English and French ──────────────────── */

const STRINGS = {
  en: {
    overview: 'Overview', feedback: 'Feedback', assistant: 'Assistant', access: 'Access', users: 'Accounts', mcp: 'MCP', account: 'Your account',
    admin: 'Administrator', editor: 'Editor', reader: 'Reader',
    overviewText: 'The state of the documentation at a glance.', pages: 'Pages', translated: 'Translated into {lang}', outdatedMissing: '{outdated} outdated · {missing} missing',
    helpful: 'Found helpful', last30: 'last 30 days', votes: '{n} votes', on: 'On', off: 'Off', public: 'Public', private: 'Private', signupsOpen: 'sign-ups open', signupsClosed: 'sign-ups closed',
    site: 'Site', siteTitle: 'Title', address: 'Address', languages: 'Languages', version: 'Lumy version',
    build: 'Last build', builtIn: '{pages} pages in {ms} ms, at {time}', notBuilt: 'The site has not been built yet, or the last build failed.', rebuild: 'Rebuild now', rebuildText: 'Build the site again from its pages and settings.', rebuilt: 'Site rebuilt: {pages} pages in {ms} ms.',
    warnings: '{n} warnings', warningsText: 'The last build left warnings: broken links, missing pages…', file: 'File', message: 'Message',
    feedbackText: 'What readers said at the end of each page.', page: 'Page', language: 'Language', lastVote: 'Last vote', comments: 'Comments', comment: 'Comment', date: 'Date', vote: 'Vote', useful: 'Helpful', notUseful: 'Not helpful',
    noFeedback: 'No votes yet. They appear here as readers answer "Was this page helpful?".', noComments: 'No comments yet.', feedbackOff: 'Feedback is off. Switch it on under Access.',
    assistantText: 'Answers readers from the documentation, with links to the pages it used.', assistantOn: 'Answer readers’ questions', assistantOnText: 'Shows “Ask AI” on every page.',
    provider: 'Provider', none: 'None', perHour: 'Questions per hour, per visitor', save: 'Save', saved: 'Saved.', baseUrl: 'Address', model: 'Model', apiKey: 'API key',
    keySaved: 'Saved. Type a new key to replace it.', keyNone: 'Paste the key', keyOptional: 'Not needed for this provider', keysNote: 'Keys are encrypted on the server and never sent to readers.',
    providers: 'Providers', key: 'Key', keyIsSaved: 'Saved', keyIsMissing: 'None', keyNotNeeded: 'Not needed', inUse: 'In use', test: 'Test', testOk: 'Ready: answered in {ms} ms.', removeKey: 'Remove the saved key', removeKeyConfirm: 'Remove the API key saved for this provider?', keyRemoved: 'Key removed.',
    providerSettings: '{provider} settings',
    hint_ollama: 'Ollama Cloud, or http://localhost:11434 for a local Ollama (no key).', hint_fal: 'fal routes chat models through OpenRouter: use ids such as openai/gpt-4o-mini.', hint_custom: 'Any server with /v1/chat/completions: LM Studio, vLLM, LocalAI, Together…',
    accessText: 'Who can read the documentation and who can have an account.', reading: 'Reading', visibility: 'Who can read', visibilityText: 'Public: anyone, no account. Private: signed-in accounts only.',
    signups: 'Sign-ups', signupsText: 'Open lets anyone create an account. Closed: only administrators add accounts.', closed: 'Closed', open: 'Open', newRole: 'New accounts are', readerFeatures: 'Reader feedback', readerFeaturesText: 'Ask “Was this page helpful?” at the end of each page.',
    kosmyBoard: 'Kosmy Board', kosmyText: 'Sign-in from Kosmy Board, and this admin. An account opens only once its owner has linked it, in Lumy’s dashboard under Account.', status: 'Status',
    issuer: 'Issuer', clientId: 'Client ID', clientSecret: 'Client secret', secretSaved: 'Saved (never shown)', secretMissing: 'None', redirectUri: 'Redirect URI', loginUri: 'Initiate login URI',
    kosmyEdit: 'Change the connection', kosmyEditText: 'Issuer, client ID and client secret, as Kosmy Board shows them.', kosmyEditConfirm: 'If these no longer match Kosmy Board, sign-in and this admin stop working until they are fixed in Lumy’s dashboard.',
    secretKeep: 'Leave empty to keep the saved secret', turnOff: 'Turn off', turnOffText: 'Stops sign-in with Kosmy Board and this admin.', turnOffConfirm: 'Sign-in with Kosmy Board and this admin will stop. Turn them on again from Lumy’s dashboard, under Access.', turnedOff: 'Kosmy Board turned off.',
    usersText: 'The accounts of this site. Your own account is changed from Lumy’s dashboard.', username: 'Username', password: 'Password', role: 'Role', linked: 'Kosmy Board', created: 'Created', you: '{name} (you)',
    makeAdmin: 'Make administrator', makeEditor: 'Make editor', makeReader: 'Make reader', setPassword: 'Set a new password', newPassword: 'New password', passwordSet: 'Password changed. This account’s devices are signed out.',
    unlink: 'Unlink from Kosmy Board', unlinkConfirm: 'This account will no longer open from Kosmy Board until its owner links it again.', unlinked: 'Unlinked from Kosmy Board.',
    remove: 'Remove', removeConfirm: 'Remove this account? Its sessions end and it cannot be brought back.', removed: 'Account removed.', addAccount: 'Add an account', added: 'Account {name} added.', roleSaved: 'Role saved.', noUsers: 'No accounts.', tooMany: 'Only the first {n} are shown here; Lumy’s dashboard shows them all.',
    mcpText: 'Let AI assistants read the documentation, and write it with a token.', mcpOn: 'MCP server', mcpOnText: 'Serve the documentation to MCP clients at the address below.',
    mcpPublic: 'Anyone can read through MCP', mcpPublicText: 'Only on a public site. Writing always needs a token.', endpoint: 'Address', connect: 'Connect a client',
    tokens: 'Access tokens', tokensText: 'A token lets an assistant write pages. It is shown once: copy it now.', name: 'Name', scope: 'Rights', write: 'Read and write', read: 'Read only',
    owner: 'Owner', lastUsed: 'Last used', never: 'never', revoke: 'Revoke', revokeConfirm: 'Revoke this token? The assistants using it lose access.', revoked: 'Token revoked.', newToken: 'New token', tokenName: 'Claude Code on my laptop', createToken: 'Create the token',
    tokenOnce: 'Copy this token now. It will not be shown again.', tokenLabel: 'Access token', noTokens: 'No tokens yet.',
    accountText: 'The Lumy account linked to your Kosmy Board account.', linkedTo: 'Linked to', changePassword: 'Change the password', current: 'Current password', passwordChanged: 'Password changed. Your other devices are signed out.',
    err_token: 'The request from Kosmy Board could not be checked. Try again.', err_off: 'Sign-in with Kosmy Board is not set up on this Lumy site.', err_unreachable: 'Kosmy Board cannot be reached from this Lumy site to check the request.',
    'err_not-linked': 'This Kosmy Board account is linked to no Lumy account. Sign in to Lumy with your password, then link it under Account → Link to Kosmy Board.',
    err_forbidden: 'Your Lumy account ({name}, {role}) is not an administrator of this site.', err_notFound: 'Not found.', err_rowGone: 'This item no longer exists.', err_self: 'Change your own account from Lumy’s dashboard, or under Your account.',
    err_required: '“{label}” is required.', err_value: '“{label}”: this value is not accepted.', err_body: 'The request could not be read.', err_method: 'Method not allowed.', err_error: 'Something went wrong on the server.',
    'err_current-password': 'The current password is wrong.', err_username: 'A username has 3 to 40 letters, digits, dots, dashes or underscores.', err_password: 'A password has at least 8 characters.',
    err_taken: 'This username is already taken.', 'err_last-admin': 'The site needs at least one administrator.', err_missing: 'This account does not exist.', err_role: 'Unknown role.',
    err_issuer: 'The issuer is an http(s) address, such as https://board.example.com/oidc.', err_choose: 'Choose a provider.',
    err_disabled: 'Your Lumy account ({name}) is disabled.', active: 'Active', disabled: 'Disabled',
  },
  fr: {
    overview: 'Vue d’ensemble', feedback: 'Avis', assistant: 'Assistant', access: 'Accès', users: 'Comptes', mcp: 'MCP', account: 'Votre compte',
    admin: 'Administrateur', editor: 'Rédacteur', reader: 'Lecteur',
    overviewText: 'L’état de la documentation en un coup d’œil.', pages: 'Pages', translated: 'Traduit en {lang}', outdatedMissing: '{outdated} en retard · {missing} manquantes',
    helpful: 'Jugées utiles', last30: '30 derniers jours', votes: '{n} votes', on: 'Activé', off: 'Désactivé', public: 'Publique', private: 'Privée', signupsOpen: 'inscriptions ouvertes', signupsClosed: 'inscriptions fermées',
    site: 'Site', siteTitle: 'Titre', address: 'Adresse', languages: 'Langues', version: 'Version de Lumy',
    build: 'Dernière construction', builtIn: '{pages} pages en {ms} ms, à {time}', notBuilt: 'Le site n’a pas encore été construit, ou la dernière construction a échoué.', rebuild: 'Reconstruire', rebuildText: 'Reconstruire le site à partir de ses pages et de ses réglages.', rebuilt: 'Site reconstruit : {pages} pages en {ms} ms.',
    warnings: '{n} avertissements', warningsText: 'La dernière construction a laissé des avertissements : liens cassés, pages manquantes…', file: 'Fichier', message: 'Message',
    feedbackText: 'Ce que les lecteurs ont répondu en bas de chaque page.', page: 'Page', language: 'Langue', lastVote: 'Dernier vote', comments: 'Commentaires', comment: 'Commentaire', date: 'Date', vote: 'Vote', useful: 'Utile', notUseful: 'Pas utile',
    noFeedback: 'Pas encore de votes. Ils apparaissent ici quand les lecteurs répondent à « Cette page vous a-t-elle aidé ? ».', noComments: 'Pas encore de commentaires.', feedbackOff: 'Les avis sont désactivés. Activez-les dans Accès.',
    assistantText: 'Répond aux lecteurs à partir de la documentation, avec des liens vers les pages utilisées.', assistantOn: 'Répondre aux questions des lecteurs', assistantOnText: 'Affiche « Demander à l’IA » sur chaque page.',
    provider: 'Fournisseur', none: 'Aucun', perHour: 'Questions par heure et par visiteur', save: 'Enregistrer', saved: 'Enregistré.', baseUrl: 'Adresse', model: 'Modèle', apiKey: 'Clé d’API',
    keySaved: 'Enregistrée. Tapez une nouvelle clé pour la remplacer.', keyNone: 'Collez la clé', keyOptional: 'Inutile pour ce fournisseur', keysNote: 'Les clés sont chiffrées sur le serveur et ne sont jamais envoyées aux lecteurs.',
    providers: 'Fournisseurs', key: 'Clé', keyIsSaved: 'Enregistrée', keyIsMissing: 'Aucune', keyNotNeeded: 'Inutile', inUse: 'Utilisé', test: 'Tester', testOk: 'Prêt : réponse en {ms} ms.', removeKey: 'Supprimer la clé enregistrée', removeKeyConfirm: 'Supprimer la clé d’API enregistrée pour ce fournisseur ?', keyRemoved: 'Clé supprimée.',
    providerSettings: 'Réglages de {provider}',
    hint_ollama: 'Ollama Cloud, ou http://localhost:11434 pour un Ollama local (sans clé).', hint_fal: 'fal passe les modèles de chat par OpenRouter : utilisez des identifiants comme openai/gpt-4o-mini.', hint_custom: 'Tout serveur avec /v1/chat/completions : LM Studio, vLLM, LocalAI, Together…',
    accessText: 'Qui peut lire la documentation, et qui peut avoir un compte.', reading: 'Lecture', visibility: 'Qui peut lire', visibilityText: 'Publique : tout le monde, sans compte. Privée : seulement les comptes connectés.',
    signups: 'Inscriptions', signupsText: 'Ouvertes : tout le monde peut créer un compte. Fermées : seuls les administrateurs ajoutent les comptes.', closed: 'Fermées', open: 'Ouvertes', newRole: 'Les nouveaux comptes sont', readerFeatures: 'Avis des lecteurs', readerFeaturesText: 'Demander « Cette page vous a-t-elle aidé ? » en bas de chaque page.',
    kosmyBoard: 'Kosmy Board', kosmyText: 'La connexion depuis Kosmy Board, et cette admin. Un compte ne s’ouvre que si son propriétaire l’a relié, dans le tableau de bord de Lumy, rubrique Compte.', status: 'État',
    issuer: 'Émetteur', clientId: 'Identifiant client', clientSecret: 'Secret client', secretSaved: 'Enregistré (jamais affiché)', secretMissing: 'Aucun', redirectUri: 'Adresse de retour', loginUri: 'Adresse de lancement',
    kosmyEdit: 'Modifier la connexion', kosmyEditText: 'Émetteur, identifiant client et secret client, tels que Kosmy Board les affiche.', kosmyEditConfirm: 'S’ils ne correspondent plus à Kosmy Board, la connexion et cette admin cessent de fonctionner jusqu’à leur correction dans le tableau de bord de Lumy.',
    secretKeep: 'Laisser vide pour garder le secret enregistré', turnOff: 'Désactiver', turnOffText: 'Arrête la connexion avec Kosmy Board et cette admin.', turnOffConfirm: 'La connexion avec Kosmy Board et cette admin vont s’arrêter. Réactivez-les depuis le tableau de bord de Lumy, rubrique Accès.', turnedOff: 'Kosmy Board désactivé.',
    usersText: 'Les comptes de ce site. Votre propre compte se modifie depuis le tableau de bord de Lumy.', username: 'Nom d’utilisateur', password: 'Mot de passe', role: 'Rôle', linked: 'Kosmy Board', created: 'Créé le', you: '{name} (vous)',
    makeAdmin: 'Rendre administrateur', makeEditor: 'Rendre rédacteur', makeReader: 'Rendre lecteur', setPassword: 'Définir un nouveau mot de passe', newPassword: 'Nouveau mot de passe', passwordSet: 'Mot de passe changé. Les appareils de ce compte sont déconnectés.',
    unlink: 'Délier de Kosmy Board', unlinkConfirm: 'Ce compte ne s’ouvrira plus depuis Kosmy Board tant que son propriétaire ne l’aura pas relié de nouveau.', unlinked: 'Délié de Kosmy Board.',
    remove: 'Supprimer', removeConfirm: 'Supprimer ce compte ? Ses sessions prennent fin et il ne pourra pas être récupéré.', removed: 'Compte supprimé.', addAccount: 'Ajouter un compte', added: 'Compte {name} ajouté.', roleSaved: 'Rôle enregistré.', noUsers: 'Aucun compte.', tooMany: 'Seuls les {n} premiers sont affichés ici ; le tableau de bord de Lumy les montre tous.',
    mcpText: 'Permettre aux assistants IA de lire la documentation, et de l’écrire avec un jeton.', mcpOn: 'Serveur MCP', mcpOnText: 'Servir la documentation aux clients MCP à l’adresse ci-dessous.',
    mcpPublic: 'Tout le monde peut lire par MCP', mcpPublicText: 'Seulement sur un site public. Écrire demande toujours un jeton.', endpoint: 'Adresse', connect: 'Connecter un client',
    tokens: 'Jetons d’accès', tokensText: 'Un jeton permet à un assistant d’écrire des pages. Il n’est affiché qu’une fois : copiez-le tout de suite.', name: 'Nom', scope: 'Droits', write: 'Lecture et écriture', read: 'Lecture seule',
    owner: 'Propriétaire', lastUsed: 'Dernière utilisation', never: 'jamais', revoke: 'Révoquer', revokeConfirm: 'Révoquer ce jeton ? Les assistants qui l’utilisent perdent l’accès.', revoked: 'Jeton révoqué.', newToken: 'Nouveau jeton', tokenName: 'Claude Code sur mon portable', createToken: 'Créer le jeton',
    tokenOnce: 'Copiez ce jeton maintenant. Il ne sera plus affiché.', tokenLabel: 'Jeton d’accès', noTokens: 'Aucun jeton pour l’instant.',
    accountText: 'Le compte Lumy relié à votre compte Kosmy Board.', linkedTo: 'Relié à', changePassword: 'Changer le mot de passe', current: 'Mot de passe actuel', passwordChanged: 'Mot de passe changé. Vos autres appareils sont déconnectés.',
    err_token: 'La demande de Kosmy Board n’a pas pu être vérifiée. Réessayez.', err_off: 'La connexion avec Kosmy Board n’est pas réglée sur ce site Lumy.', err_unreachable: 'Ce site Lumy ne peut pas joindre Kosmy Board pour vérifier la demande.',
    'err_not-linked': 'Ce compte Kosmy Board n’est relié à aucun compte Lumy. Connectez-vous à Lumy avec votre mot de passe, puis reliez-le dans Compte → Relier à Kosmy Board.',
    err_forbidden: 'Votre compte Lumy ({name}, {role}) n’est pas administrateur de ce site.', err_notFound: 'Introuvable.', err_rowGone: 'Cet élément n’existe plus.', err_self: 'Modifiez votre propre compte depuis le tableau de bord de Lumy, ou dans Votre compte.',
    err_required: '« {label} » est obligatoire.', err_value: '« {label} » : cette valeur n’est pas acceptée.', err_body: 'La demande est illisible.', err_method: 'Méthode non autorisée.', err_error: 'Une erreur est survenue sur le serveur.',
    'err_current-password': 'Le mot de passe actuel est incorrect.', err_username: 'Un nom d’utilisateur contient de 3 à 40 lettres, chiffres, points, tirets ou soulignés.', err_password: 'Un mot de passe contient au moins 8 caractères.',
    err_taken: 'Ce nom d’utilisateur est déjà pris.', 'err_last-admin': 'Le site doit garder au moins un administrateur.', err_missing: 'Ce compte n’existe pas.', err_role: 'Rôle inconnu.',
    err_issuer: 'L’émetteur est une adresse http(s), par exemple https://board.exemple.fr/oidc.', err_choose: 'Choisissez un fournisseur.',
    err_disabled: 'Votre compte Lumy ({name}) est désactivé.', active: 'Actif', disabled: 'Désactivé',
  },
}

/** `fr` or `en`, the first of the two that Accept-Language names; English otherwise. */
export function pickLanguage(header) {
  for (const part of String(header || '').split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase().slice(0, 2)
    if (tag === 'fr' || tag === 'en') return tag
  }
  return 'en'
}

export function words(lang, extra = {}) {
  const t = (key, vars = {}) => String(extra[lang]?.[key] ?? extra.en?.[key] ?? STRINGS[lang][key] ?? STRINGS.en[key] ?? key).replace(/\{(\w+)\}/g, (m, v) => (v in vars ? vars[v] : m))
  const date = (iso, withTime) => {
    if (!iso) return '—'
    try {
      return new Intl.DateTimeFormat(lang, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(iso))
    } catch {
      return String(iso).slice(0, 10)
    }
  }
  return { t, date, lang }
}

export class AdminError extends Error {
  constructor(status, code, message) {
    super(code)
    Object.assign(this, { status, code, userMessage: message })
  }
}

/** Lumy's own error codes (auth, settings) → a status and a message in the person's language. */
function lumyError(err, t) {
  const status = { taken: 409, 'last-admin': 409, missing: 404, username: 422, password: 422, role: 422, issuer: 422 }[err.code]
  if (!status) return null
  return new AdminError(status, err.code === 'missing' ? 'not_found' : String(err.code).replace(/-/g, '_'), t(`err_${err.code}`))
}

/**
 * Re-check what Kosmy Board sent against the fields the section described:
 * Kosmy Board only passes values on, it decides nothing.
 */
function checkValues(fields, values, t) {
  if (values !== undefined && (values === null || typeof values !== 'object' || Array.isArray(values))) throw new AdminError(400, 'invalid', t('err_body'))
  const v = values || {}
  const out = {}
  const bad = (f, key = 'err_value') => {
    throw new AdminError(422, 'invalid', t(key, { label: f.label }))
  }
  for (const f of fields) {
    if (f.readOnly) continue
    let x = v[f.name]
    if (f.type === 'checkbox') {
      if (x !== undefined && typeof x !== 'boolean') bad(f)
      out[f.name] = x === true
      continue
    }
    if (f.type === 'number') {
      if (x === undefined || x === null || x === '') {
        if (f.required) bad(f, 'err_required')
        continue
      }
      x = Number(x)
      if (!Number.isFinite(x) || (f.min !== undefined && x < f.min) || (f.max !== undefined && x > f.max) || (f.step === 1 && !Number.isInteger(x))) bad(f)
      out[f.name] = x
      continue
    }
    if (x === undefined || x === null) x = ''
    if (typeof x !== 'string') bad(f)
    if (f.type !== 'password') x = x.trim()
    if (!x) {
      if (f.required) bad(f, 'err_required')
    } else {
      if (f.maxLength && x.length > f.maxLength) bad(f)
      if (f.type === 'url' && !/^https?:\/\/\S+$/i.test(x)) bad(f)
      if (f.type === 'email' && !/^[^\s@]+@[^\s@]+$/.test(x)) bad(f)
    }
    if (f.type === 'select' && !f.options.some((o) => o.value === x)) bad(f)
    out[f.name] = x
  }
  return out
}

/* ── The handler ────────────────────────────────────────────────────── */

/**
 * Everything comes from the server that runs the dashboard: the same account
 * functions, the same settings patch and rebuild, the same summaries.
 */
export function createBoardAdmin(app) {
  const { oidc, auth, tokens, store, log = () => {} } = app
  const seen = new Map() // jti → when it can be forgotten (ms): a token serves once

  function json(res, status, value, headers = {}) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers })
    res.end(JSON.stringify(value))
  }

  /** The token, then the account: kosmy.board-admin.v1, "Authentification", steps 1 to 6. */
  async function authenticate(req, path, { t }) {
    const s = app.kosmySettings()
    if (!s) throw new AdminError(401, 'invalid_token', t('err_off'))
    const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(String(req.headers.authorization || ''))
    if (!m) throw new AdminError(401, 'invalid_token', t('err_token'))
    let claims
    try {
      claims = await oidc.verifyAdminToken(m[1], { issuer: s.issuer, clientId: s.clientId, method: req.method, path })
    } catch (err) {
      log(`  Kosmy Board admin: request refused, ${err.message}`)
      throw new AdminError(401, 'invalid_token', t(err.code === 'unreachable' || err.code === 'discovery' ? 'err_unreachable' : 'err_token'))
    }
    const now = Date.now()
    for (const [jti, until] of seen) if (until < now) seen.delete(jti)
    if (seen.has(claims.jti)) {
      log('  Kosmy Board admin: request refused, token already used')
      throw new AdminError(401, 'invalid_token', t('err_token'))
    }
    seen.set(claims.jti, claims.exp * 1000 + 30_000)

    const user = await auth.findByKosmy(claims.sub)
    if (!user) throw new AdminError(403, 'not_linked', t('err_not-linked'))
    if (user.disabled) throw new AdminError(403, 'forbidden', t('err_disabled', { name: user.username }))
    if (user.role !== 'admin') throw new AdminError(403, 'forbidden', t('err_forbidden', { name: user.username, role: t(user.role) }))
    return user
  }

  /* ── Sections ─────────────────────────────────────────────────────── */

  const SECTIONS = ['overview', 'feedback', 'assistant', 'access', 'users', 'mcp', 'account']
  const roleCell = (role, t) => ({ text: t(role), ...(role === 'admin' ? { tone: 'success' } : role === 'reader' ? { tone: 'muted' } : {}) })
  const onOff = (on, t) => ({ text: t(on ? 'on' : 'off'), tone: on ? 'success' : 'muted' })
  const percent = (yes, no) => (yes + no ? `${Math.round((yes / (yes + no)) * 100)} %` : '—')

  /* Forms and action fields: described once, used to draw and to re-check. */
  const FIELDS = {
    assistant: (s, { t }) => [
      { name: 'enabled', label: t('assistantOn'), type: 'checkbox', value: s.assistant.enabled, help: t('assistantOnText') },
      { name: 'provider', label: t('provider'), type: 'select', value: s.assistant.provider, options: [{ value: '', label: t('none') }, ...PROVIDERS.map((p) => ({ value: p.id, label: p.label }))] },
      { name: 'perHour', label: t('perHour'), type: 'number', value: s.assistant.perHour, min: 1, max: 1000, step: 1, required: true },
    ],
    provider: (s, def, { t }) => {
      const cfg = s.assistant.providers[def.id] || {}
      const hint = STRINGS.en[`hint_${def.id}`] ? t(`hint_${def.id}`) : def.hint || ''
      return [
        { name: 'baseUrl', label: t('baseUrl'), type: 'url', value: cfg.baseUrl || '', placeholder: def.baseUrl || 'https://…', maxLength: 500, ...(hint ? { help: hint } : {}) },
        { name: 'model', label: t('model'), type: 'text', value: cfg.model || '', placeholder: def.model || '', maxLength: 200 },
        { name: 'apiKey', label: t('apiKey'), type: 'password', placeholder: def.keyOptional && !cfg.apiKey ? t('keyOptional') : cfg.apiKey ? t('keySaved') : t('keyNone'), maxLength: 2000 },
      ]
    },
    access: (s, { t }) => [
      { name: 'access', label: t('visibility'), type: 'select', value: s.access, help: t('visibilityText'), options: [{ value: 'public', label: t('public') }, { value: 'private', label: t('private') }] },
      { name: 'registration', label: t('signups'), type: 'select', value: s.registration, help: t('signupsText'), options: [{ value: 'closed', label: t('closed') }, { value: 'open', label: t('open') }] },
      { name: 'defaultRole', label: t('newRole'), type: 'select', value: s.defaultRole, options: [{ value: 'reader', label: t('reader') }, { value: 'editor', label: t('editor') }] },
      { name: 'feedback', label: t('readerFeatures'), type: 'checkbox', value: s.feedback, help: t('readerFeaturesText') },
    ],
    kosmy: (s, { t }) => [
      { name: 'issuer', label: t('issuer'), type: 'url', value: s.kosmyBoard.issuer, placeholder: 'https://board.example.com/oidc', required: true, maxLength: 500 },
      { name: 'clientId', label: t('clientId'), type: 'text', value: s.kosmyBoard.clientId, required: true, maxLength: 200 },
      { name: 'clientSecret', label: t('clientSecret'), type: 'password', placeholder: t('secretKeep'), maxLength: 500 },
    ],
    addUser: ({ t }) => [
      { name: 'username', label: t('username'), type: 'text', required: true, maxLength: 40 },
      { name: 'password', label: t('password'), type: 'password', required: true },
      { name: 'role', label: t('role'), type: 'select', value: 'editor', options: ROLES.map((r) => ({ value: r, label: t(r) })) },
    ],
    setPassword: ({ t }) => [{ name: 'password', label: t('newPassword'), type: 'password', required: true }],
    mcp: (s, { t }) => [
      { name: 'enabled', label: t('mcpOn'), type: 'checkbox', value: s.mcp.enabled, help: t('mcpOnText') },
      { name: 'publicRead', label: t('mcpPublic'), type: 'checkbox', value: s.mcp.publicRead, help: t('mcpPublicText') },
    ],
    token: ({ t }) => [
      { name: 'name', label: t('name'), type: 'text', placeholder: t('tokenName'), maxLength: 60 },
      { name: 'scope', label: t('scope'), type: 'select', value: 'write', options: [{ value: 'write', label: t('write') }, { value: 'read', label: t('read') }] },
    ],
    password: ({ t }) => [
      { name: 'current', label: t('current'), type: 'password', required: true },
      { name: 'password', label: t('newPassword'), type: 'password', required: true },
    ],
  }

  const ROLE_ACTIONS = { 'make-admin': 'admin', 'make-editor': 'editor', 'make-reader': 'reader' }

  async function section(id, me, req, w) {
    const { t, date } = w
    const s = app.settings()
    const config = app.config()
    const site = app.instance(req)
    const origin = new URL(site + '/').origin

    switch (id) {
      case 'overview': {
        const o = await app.overview()
        const warnings = o.build?.warnings || []
        const stats = [{ label: t('pages'), value: o.build?.pages ?? '—', hint: o.languages.map((l) => l.toUpperCase()).join(' · ') }]
        for (const [code, r] of Object.entries(o.translations || {})) {
          const total = r.current.length + r.outdated.length + r.unverified.length + r.missing.length
          stats.push({ label: t('translated', { lang: code.toUpperCase() }), value: `${r.current.length}/${total}`, hint: t('outdatedMissing', { outdated: r.outdated.length, missing: r.missing.length }) })
        }
        stats.push({ label: `${t('helpful')} · ${t('last30')}`, value: percent(o.feedback.yes, o.feedback.no), hint: t('votes', { n: o.feedback.yes + o.feedback.no }) })
        stats.push({ label: t('assistant'), value: t(o.assistant.enabled ? 'on' : 'off'), hint: o.assistant.provider || '—' })
        stats.push({ label: t('access'), value: t(o.access), hint: o.registration === 'open' ? t('signupsOpen') : t('signupsClosed') })
        stats.push({ label: t('users'), value: o.users })
        return {
          id, title: t('overview'), description: t('overviewText'),
          blocks: [
            ...(o.build ? [] : [{ type: 'notice', tone: 'warning', title: t('build'), text: t('notBuilt') }]),
            { type: 'stats', items: stats },
            { type: 'fields', title: t('site'), items: [
              { label: t('siteTitle'), value: config.title },
              { label: t('address'), value: site + '/' },
              { label: t('languages'), value: config.languages.map((l) => `${l.label} (${l.code})`).join(', ') },
              { label: t('version'), value: app.version },
              { label: t('build'), value: o.build ? t('builtIn', { pages: o.build.pages, ms: o.build.ms, time: date(o.build.at, true) }) : '—' },
            ] },
            { type: 'actions', items: [{ id: 'rebuild', label: t('rebuild'), description: t('rebuildText') }] },
            ...(warnings.length
              ? [
                  { type: 'notice', tone: 'warning', title: t('warnings', { n: warnings.length }), text: t('warningsText') },
                  { type: 'table', id: 'warnings', columns: [{ key: 'file', label: t('file') }, { key: 'message', label: t('message') }], rows: warnings.slice(0, MAX_ROWS).map((x, i) => ({ id: `w${i}`, cells: { file: x.file, message: x.message } })) },
                ]
              : []),
          ],
        }
      }

      case 'feedback': {
        const f = await app.feedbackSummary()
        const link = (lang, page) => (config.langCodes.includes(lang) ? { text: page || 'index', href: origin + pageUrl(config, lang, page) } : page || 'index')
        return {
          id, title: t('feedback'), description: t('feedbackText'),
          blocks: [
            ...(s.feedback ? [] : [{ type: 'notice', tone: 'warning', text: t('feedbackOff') }]),
            { type: 'table', id: 'pages', title: t('pages'),
              columns: [{ key: 'page', label: t('page') }, { key: 'lang', label: t('language') }, { key: 'yes', label: t('useful') }, { key: 'no', label: t('notUseful') }, { key: 'helpful', label: t('helpful') }, { key: 'last', label: t('lastVote') }],
              rows: f.pages.slice(0, MAX_ROWS).map((p) => ({ id: `${p.lang}|${p.page}`.slice(0, 200), cells: { page: link(p.lang, p.page), lang: p.lang.toUpperCase(), yes: p.yes, no: p.no, helpful: percent(p.yes, p.no), last: date(p.last, true) } })),
              empty: t('noFeedback') },
            { type: 'table', id: 'comments', title: t('comments'),
              columns: [{ key: 'date', label: t('date') }, { key: 'page', label: t('page') }, { key: 'vote', label: t('vote') }, { key: 'comment', label: t('comment') }],
              rows: f.comments.map((c, i) => ({ id: `c${i}`, cells: { date: date(c.at, true), page: link(c.lang, c.page), vote: c.value === 'yes' ? { text: t('useful'), tone: 'success' } : { text: t('notUseful'), tone: 'danger' }, comment: c.comment } })),
              empty: t('noComments') },
          ],
        }
      }

      case 'assistant': {
        const a = s.assistant
        return {
          id, title: t('assistant'), description: t('assistantText'),
          blocks: [
            { type: 'form', id: 'assistant', action: 'save-assistant', submit: t('save'), fields: FIELDS.assistant(s, w) },
            { type: 'table', id: 'providers', title: t('providers'),
              columns: [{ key: 'provider', label: t('provider') }, { key: 'model', label: t('model') }, { key: 'address', label: t('baseUrl') }, { key: 'key', label: t('key') }],
              rows: PROVIDERS.map((p) => {
                const cfg = a.providers[p.id] || {}
                return {
                  id: p.id,
                  cells: {
                    provider: p.id === a.provider ? { text: `${p.label} · ${t('inUse')}`, tone: 'success' } : p.label,
                    model: cfg.model || p.model || '—',
                    address: cfg.baseUrl || p.baseUrl || '—',
                    key: cfg.apiKey ? { text: t('keyIsSaved'), tone: 'success' } : p.keyOptional ? { text: t('keyNotNeeded'), tone: 'muted' } : { text: t('keyIsMissing'), tone: 'warning' },
                  },
                  actions: ['test', ...(cfg.apiKey ? ['remove-key'] : [])],
                }
              }),
              rowActions: [
                { id: 'test', label: t('test') },
                { id: 'remove-key', label: t('removeKey'), danger: true, confirm: t('removeKeyConfirm') },
              ] },
            ...PROVIDERS.map((p) => ({ type: 'form', id: `provider-${p.id}`, title: t('providerSettings', { provider: p.label }), description: t('keysNote'), action: `save-provider:${p.id}`, submit: t('save'), fields: FIELDS.provider(s, p, w) })),
          ],
        }
      }

      case 'access': {
        const k = app.dashboardSettings(req).kosmyBoard
        return {
          id, title: t('access'), description: t('accessText'),
          blocks: [
            { type: 'form', id: 'access', title: t('reading'), action: 'save-access', submit: t('save'), fields: FIELDS.access(s, w) },
            { type: 'fields', title: t('kosmyBoard'), items: [
              { label: t('status'), value: t(k.enabled ? 'on' : 'off') },
              { label: t('issuer'), value: k.issuer || '—' },
              { label: t('clientId'), value: k.clientId || '—' },
              { label: t('clientSecret'), value: k.hasSecret ? t('secretSaved') : t('secretMissing') },
              { label: t('redirectUri'), value: k.redirectUri },
              { label: t('loginUri'), value: k.loginUri },
            ] },
            { type: 'actions', title: t('kosmyBoard'), items: [
              { id: 'kosmy-edit', label: t('kosmyEdit'), description: t('kosmyEditText'), confirm: t('kosmyEditConfirm'), fields: FIELDS.kosmy(s, w) },
              { id: 'kosmy-off', label: t('turnOff'), description: t('turnOffText'), danger: true, confirm: t('turnOffConfirm') },
            ] },
          ],
        }
      }

      case 'users': {
        const users = await auth.users()
        return {
          id, title: t('users'), description: t('usersText'),
          blocks: [
            ...(users.length > MAX_ROWS ? [{ type: 'notice', text: t('tooMany', { n: MAX_ROWS }) }] : []),
            { type: 'table', id: 'accounts',
              columns: [{ key: 'username', label: t('username') }, { key: 'role', label: t('role') }, { key: 'status', label: t('status') }, { key: 'kosmy', label: t('linked') }, { key: 'created', label: t('created') }],
              rows: users.slice(0, MAX_ROWS).map((u) => ({
                id: u.id,
                cells: {
                  username: u.id === me.id ? t('you', { name: u.username }) : u.username,
                  role: roleCell(u.role, t),
                  status: u.disabled ? { text: t('disabled'), tone: 'danger' } : { text: t('active'), tone: 'success' },
                  kosmy: u.kosmy ? [u.kosmy.name, u.kosmy.email && `(${u.kosmy.email})`].filter(Boolean).join(' ') || t('kosmyBoard') : null,
                  created: date(u.createdAt),
                },
                // Your own account is changed from Lumy's dashboard: no locking yourself out from here.
                actions: u.id === me.id ? [] : [...Object.keys(ROLE_ACTIONS).filter((a) => ROLE_ACTIONS[a] !== u.role), 'set-password', ...(u.kosmy ? ['unlink'] : []), 'delete'],
              })),
              rowActions: [
                { id: 'make-admin', label: t('makeAdmin') },
                { id: 'make-editor', label: t('makeEditor') },
                { id: 'make-reader', label: t('makeReader') },
                { id: 'set-password', label: t('setPassword'), fields: FIELDS.setPassword(w) },
                { id: 'unlink', label: t('unlink'), confirm: t('unlinkConfirm') },
                { id: 'delete', label: t('remove'), danger: true, confirm: t('removeConfirm') },
              ],
              actions: [{ id: 'add', label: t('addAccount'), fields: FIELDS.addUser(w) }],
              empty: t('noUsers') },
          ],
        }
      }

      case 'mcp': {
        const list = await app.tokenList(me)
        const endpoint = `${site}/_lumy/mcp`
        const slug = String(config.title).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'docs'
        return {
          id, title: t('mcp'), description: t('mcpText'),
          blocks: [
            { type: 'form', id: 'mcp', action: 'save-mcp', submit: t('save'), fields: FIELDS.mcp(s, w) },
            { type: 'fields', items: [
              { label: t('endpoint'), value: endpoint },
              { label: t('connect'), value: `claude mcp add --transport http ${slug} ${endpoint} --header "Authorization: Bearer <token>"` },
            ] },
            { type: 'table', id: 'tokens', title: t('tokens'),
              columns: [{ key: 'name', label: t('name') }, { key: 'scope', label: t('scope') }, { key: 'owner', label: t('owner') }, { key: 'created', label: t('created') }, { key: 'lastUsed', label: t('lastUsed') }],
              rows: list.slice(0, MAX_ROWS).map((tk) => ({
                id: tk.id,
                cells: { name: tk.name, scope: { text: tk.scope === 'read' ? t('read') : t('write'), tone: tk.scope === 'read' ? 'muted' : 'warning' }, owner: tk.owner, created: date(tk.createdAt), lastUsed: tk.lastUsed ? date(tk.lastUsed, true) : t('never') },
                actions: ['revoke'],
              })),
              rowActions: [{ id: 'revoke', label: t('revoke'), danger: true, confirm: t('revokeConfirm') }],
              actions: [{ id: 'create-token', label: t('newToken'), description: t('tokensText'), fields: FIELDS.token(w) }],
              empty: t('noTokens') },
          ],
        }
      }

      case 'account':
        return {
          id, title: t('account'), description: t('accountText'),
          blocks: [
            { type: 'fields', items: [
              { label: t('username'), value: me.username },
              { label: t('role'), value: t(me.role) },
              { label: t('linkedTo'), value: [me.kosmy?.name, me.kosmy?.email && `(${me.kosmy.email})`].filter(Boolean).join(' ') || t('kosmyBoard') },
              { label: t('created'), value: date(me.createdAt) },
            ] },
            { type: 'form', id: 'password', title: t('changePassword'), action: 'change-password', submit: t('save'), fields: FIELDS.password(w) },
          ],
        }

      default:
        return null
    }
  }

  /* ── Actions: re-checked, then the dashboard's own functions ──────── */

  async function act(id, body, me, req, w) {
    const { t } = w
    const s = app.settings()
    const action = body.action
    const notFound = () => new AdminError(404, 'not_found', t('err_notFound'))

    if (id === 'overview' && action === 'rebuild') {
      const b = await app.rebuild()
      if (!b) return { message: t('notBuilt') }
      return { message: t('rebuilt', { pages: b.pages, ms: b.ms }) }
    }

    if (id === 'assistant') {
      if (action === 'save-assistant') {
        const v = checkValues(FIELDS.assistant(s, w), body.values, t)
        await app.applySettings({ assistant: { enabled: v.enabled, provider: v.provider, perHour: v.perHour } })
        return { message: t('saved') }
      }
      const save = /^save-provider:([\w-]+)$/.exec(action)
      if (save) {
        const def = providerById(save[1])
        if (!def) throw notFound()
        const v = checkValues(FIELDS.provider(s, def, w), body.values, t)
        await app.applySettings({ assistant: { providers: { [def.id]: { baseUrl: v.baseUrl, model: v.model, ...(v.apiKey.trim() ? { apiKey: v.apiKey } : {}) } } } })
        return { message: t('saved') }
      }
      if (action === 'test' || action === 'remove-key') {
        const def = providerById(body.row)
        if (!def) throw new AdminError(404, 'not_found', t('err_rowGone'))
        if (action === 'remove-key') {
          await app.applySettings({ assistant: { providers: { [def.id]: { apiKey: null } } } })
          return { message: t('keyRemoved') }
        }
        try {
          const r = await testProvider(activeProvider(store, s, { provider: def.id }))
          return { message: t('testOk', { ms: r.ms }) }
        } catch (err) {
          throw new AdminError(422, 'test_failed', err.message)
        }
      }
      throw notFound()
    }

    if (id === 'access') {
      if (action === 'save-access') {
        const v = checkValues(FIELDS.access(s, w), body.values, t)
        await app.applySettings(v)
        return { message: t('saved') }
      }
      if (action === 'kosmy-edit') {
        const v = checkValues(FIELDS.kosmy(s, w), body.values, t)
        await app.applySettings({ kosmyBoard: { issuer: v.issuer, clientId: v.clientId, ...(v.clientSecret.trim() ? { clientSecret: v.clientSecret } : {}) } })
        log(`  Kosmy Board admin: "${me.username}" changed the Kosmy Board connection`)
        return { message: t('saved') }
      }
      if (action === 'kosmy-off') {
        await app.applySettings({ kosmyBoard: { issuer: '', clientId: '', clientSecret: null } })
        log(`  Kosmy Board admin: "${me.username}" turned Kosmy Board off`)
        return { message: t('turnedOff') }
      }
      throw notFound()
    }

    if (id === 'users') {
      if (action === 'add') {
        const v = checkValues(FIELDS.addUser(w), body.values, t)
        const created = await auth.createUser({ username: v.username, password: v.password, role: v.role })
        return { message: t('added', { name: created.username }) }
      }
      if (!['set-password', 'unlink', 'delete', ...Object.keys(ROLE_ACTIONS)].includes(action)) throw notFound()
      const target = (await auth.users()).find((u) => u.id === body.row)
      if (!target) throw new AdminError(404, 'not_found', t('err_rowGone'))
      if (target.id === me.id) throw new AdminError(422, 'self', t('err_self'))
      if (ROLE_ACTIONS[action]) {
        await auth.updateUser(target.id, { role: ROLE_ACTIONS[action] })
        return { message: t('roleSaved') }
      }
      if (action === 'set-password') {
        const v = checkValues(FIELDS.setPassword(w), body.values, t)
        await auth.updateUser(target.id, { password: v.password })
        return { message: t('passwordSet') }
      }
      if (action === 'unlink') {
        await auth.unlinkKosmy(target.id)
        return { message: t('unlinked') }
      }
      await auth.deleteUser(target.id)
      return { message: t('removed') }
    }

    if (id === 'mcp') {
      if (action === 'save-mcp') {
        const v = checkValues(FIELDS.mcp(s, w), body.values, t)
        await app.applySettings({ mcp: v })
        return { message: t('saved') }
      }
      if (action === 'create-token') {
        const v = checkValues(FIELDS.token(w), body.values, t)
        const token = await tokens.create({ name: v.name || t('tokenName'), userId: me.id, scope: v.scope === 'read' ? 'read' : 'write' })
        return { message: t('tokenOnce'), reveal: { label: t('tokenLabel'), value: token.token } }
      }
      if (action === 'revoke') {
        const tk = (await app.tokenList(me)).find((x) => x.id === body.row)
        if (!tk) throw new AdminError(404, 'not_found', t('err_rowGone'))
        await tokens.revoke(tk.id)
        return { message: t('revoked') }
      }
      throw notFound()
    }

    if (id === 'account' && action === 'change-password') {
      const v = checkValues(FIELDS.password(w), body.values, t)
      if (!(await auth.checkPassword(me.id, v.current))) throw new AdminError(422, 'current_password', t('err_current-password'))
      await auth.updateUser(me.id, { password: v.password })
      return { message: t('passwordChanged') }
    }

    throw notFound()
  }

  /** Handles `sub` (the path under the site's base) when it is the admin API; returns false otherwise. */
  async function handle(req, res, sub) {
    if (sub !== ADMIN_API && !sub.startsWith(ADMIN_API + '/')) return false
    const w = words(pickLanguage(req.headers['accept-language']))
    const { t } = w
    try {
      if (req.method !== 'GET' && req.method !== 'POST') throw Object.assign(new AdminError(405, 'method_not_allowed', t('err_method')), { allow: 'GET, POST' })
      // The path as it was asked for, for `htu`: without query, not decoded.
      const path = new URL(req.url, 'http://x').pathname
      const me = await authenticate(req, path, w)
      const id = sub.slice(ADMIN_API.length + 1)

      if (sub === ADMIN_API) {
        if (req.method !== 'GET') throw Object.assign(new AdminError(405, 'method_not_allowed', t('err_method')), { allow: 'GET' })
        json(res, 200, {
          protocol: PROTOCOL,
          app: { name: 'Lumy', version: app.version },
          user: { name: me.username, role: t(me.role) },
          sections: SECTIONS.map((s) => ({ id: s, title: t(s) })),
        })
        return true
      }
      if (!SECTION_ID.test(id) || !SECTIONS.includes(id)) throw new AdminError(404, 'not_found', t('err_notFound'))
      if (req.method === 'GET') {
        json(res, 200, await section(id, me, req, w))
        return true
      }

      let body
      try {
        body = JSON.parse((await app.readBody(req)) || 'null')
      } catch (err) {
        throw err.status === 413 ? new AdminError(413, 'too_large', t('err_body')) : new AdminError(400, 'invalid', t('err_body'))
      }
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.action !== 'string' || !ACTION_ID.test(body.action)) throw new AdminError(400, 'invalid', t('err_body'))
      if (body.row !== undefined && typeof body.row !== 'string') throw new AdminError(400, 'invalid', t('err_body'))
      let result
      try {
        result = await act(id, body, me, req, w)
      } catch (err) {
        throw err instanceof AdminError ? err : lumyError(err, t) || err
      }
      log(`  Kosmy Board admin: "${me.username}" ${id}/${body.action}${body.row ? ` (${body.row})` : ''}`)
      // A fresh account: the action may have changed it (a new password, say).
      const fresh = (await auth.users()).find((u) => u.id === me.id) || me
      json(res, 200, { ok: true, ...result, section: await section(id, fresh, req, w) })
    } catch (err) {
      if (err instanceof AdminError) {
        json(res, err.status, { error: err.code, ...(err.userMessage ? { message: err.userMessage } : {}) }, err.allow ? { allow: err.allow } : {})
      } else {
        log(`  Kosmy Board admin: ${err.stack || err.message}`)
        if (!res.headersSent) json(res, 500, { error: 'server_error', message: t('err_error') })
      }
    }
    return true
  }

  return { handle, authenticate, json }
}
