/**
 * The users managed by Kosmy Board (protocol kosmy.board-users.v1).
 *
 * An administrator of Kosmy Board chooses who gets into this Lumy site, with
 * which role and which restrictions. Kosmy Board's server then calls, under
 * the site's base path:
 *   GET    {base}api/kosmy-board/users        roles, restrictions, linked accounts
 *   PUT    {base}api/kosmy-board/users/{sub}  create, link or update that person's account
 *   DELETE {base}api/kosmy-board/users/{sub}  disable it (its data stays)
 * with the same one-request token as the admin in Kosmy Board. The `sub` of
 * the token is the person who acts: it must open an active Lumy administrator.
 * The `sub` of the address is only the person managed: it gives no rights.
 *
 * Accounts created here have no password: they sign in through Kosmy Board.
 *
 * Spec: https://github.com/PetitOursManu/Kosmy-Board/blob/main/docs/users-api.md
 */
import { ROLES, LIMITS, limitsOf } from './auth.js'
import { AdminError, pickLanguage, words } from './board-admin.js'

export const USERS_API = 'api/kosmy-board/users'
export const PROTOCOL = 'kosmy.board-users.v1'
const SUB = /^[A-Za-z0-9-]{1,64}$/
const MAX_USERS = 500

const STRINGS = {
  en: {
    role_admin: 'Administrator', role_editor: 'Editor', role_reader: 'Reader',
    roleText_admin: 'Runs the site: settings, accounts, assistant, MCP.',
    roleText_editor: 'Looks after the content: overview, reader feedback, rebuilds, MCP access tokens.',
    roleText_reader: 'Reads the documentation when it is private.',
    field_mcpTokens: 'Can use MCP access tokens', help_mcpTokens: 'Create access tokens for AI assistants. Off: the editor cannot create any, and their existing tokens stop working.',
    created: 'Account {name} created. It signs in with Kosmy Board.', linked: 'Existing account {name} linked.', updated: 'Account {name} updated.', disabledDone: 'Account {name} disabled. Its sessions are closed.',
    'err_role': 'Unknown role.', err_limit: '“{label}”: this value is not accepted.', err_limits: 'The restrictions could not be read.',
    'err_email-taken': 'This email address belongs to a Lumy account already linked to another Kosmy Board account.',
    'err_self-admin': 'You cannot remove your own administrator rights.', 'err_self-disable': 'You cannot remove your own access.',
    'err_last-admin': 'The site needs at least one active administrator.',
  },
  fr: {
    role_admin: 'Administrateur', role_editor: 'Rédacteur', role_reader: 'Lecteur',
    roleText_admin: 'Gère le site : réglages, comptes, assistant, MCP.',
    roleText_editor: 'S’occupe du contenu : vue d’ensemble, avis des lecteurs, reconstructions, jetons d’accès MCP.',
    roleText_reader: 'Lit la documentation quand elle est privée.',
    field_mcpTokens: 'Peut utiliser des jetons d’accès MCP', help_mcpTokens: 'Créer des jetons d’accès pour les assistants IA. Décoché : le rédacteur ne peut pas en créer, et ses jetons existants cessent de fonctionner.',
    created: 'Compte {name} créé. Il se connecte avec Kosmy Board.', linked: 'Compte existant {name} relié.', updated: 'Compte {name} mis à jour.', disabledDone: 'Compte {name} désactivé. Ses sessions sont fermées.',
    'err_role': 'Rôle inconnu.', err_limit: '« {label} » : cette valeur n’est pas acceptée.', err_limits: 'Les restrictions sont illisibles.',
    'err_email-taken': 'Cette adresse e-mail appartient à un compte Lumy déjà relié à un autre compte Kosmy Board.',
    'err_self-admin': 'Vous ne pouvez pas vous retirer vos propres droits d’administration.', 'err_self-disable': 'Vous ne pouvez pas retirer votre propre accès.',
    'err_last-admin': 'Le site doit garder au moins un administrateur actif.',
  },
}

/** The roles, as Kosmy Board shows them. */
export const describeRoles = (t) => ROLES.map((r) => ({ value: r, label: t(`role_${r}`), description: t(`roleText_${r}`), ...(r === 'admin' ? { admin: true } : {}) }))

/** The restrictions, as Kosmy Board shows them. */
export const describeFields = (t) => LIMITS.map((f) => ({ name: f.name, label: t(`field_${f.name}`), type: f.type, value: f.value, help: t(`help_${f.name}`), roles: f.roles }))

/** Lumy's account errors → a status and a message in the person's language. */
export function provisionError(err, t) {
  if (err.code === 'role') return new AdminError(422, 'invalid', t('err_role'))
  if (err.code === 'limit') return new AdminError(422, 'invalid', err.field ? t('err_limit', { label: t(`field_${err.field}`) }) : t('err_limits'))
  if (['email-taken', 'self-admin', 'self-disable', 'last-admin'].includes(err.code)) return new AdminError(409, 'conflict', t(`err_${err.code}`))
  return null
}

export const userWords = (lang) => words(lang, STRINGS)

/**
 * `admin` is the admin in Kosmy Board (its token check, shared so that a token
 * serves once across both); the rest comes from the server.
 */
export function createBoardUsers({ admin, auth, settings, readBody, log = () => {} }) {
  const { authenticate, json } = admin

  async function list() {
    const users = (await auth.users()).filter((u) => u.kosmy?.sub)
    return users.slice(0, MAX_USERS).map((u) => ({ sub: u.kosmy.sub, role: ROLES.includes(u.role) ? u.role : null, values: limitsOf(u), active: !u.disabled, account: u.username }))
  }

  /** Handles `sub` (the path under the site's base) when it is the users API; returns false otherwise. */
  async function handle(req, res, sub) {
    if (sub !== USERS_API && !sub.startsWith(USERS_API + '/')) return false
    const w = userWords(pickLanguage(req.headers['accept-language']))
    const { t } = w
    try {
      const target = sub === USERS_API ? null : sub.slice(USERS_API.length + 1)
      const allowed = target === null ? ['GET'] : ['PUT', 'DELETE']
      if (!allowed.includes(req.method)) throw Object.assign(new AdminError(405, 'method_not_allowed', t('err_method')), { allow: allowed.join(', ') })
      // The path as it was asked for, for `htu`: without query, not decoded.
      const path = new URL(req.url, 'http://x').pathname
      const me = await authenticate(req, path, w)

      if (target === null) {
        json(res, 200, { protocol: PROTOCOL, roles: describeRoles(t), defaultRole: settings().defaultRole, fields: describeFields(t), users: await list() })
        return true
      }
      if (!SUB.test(target)) throw new AdminError(404, 'not_found', t('err_notFound'))

      if (req.method === 'DELETE') {
        let user
        try {
          user = await auth.disableKosmy(target, { actor: me.kosmy.sub })
        } catch (err) {
          throw provisionError(err, t) || err
        }
        if (user) log(`  Kosmy Board users: "${me.username}" disabled "${user.username}"`)
        json(res, 200, { ok: true, ...(user ? { message: t('disabledDone', { name: user.username }) } : {}) })
        return true
      }

      let body
      try {
        body = JSON.parse((await readBody(req)) || 'null')
      } catch (err) {
        throw err.status === 413 ? new AdminError(413, 'too_large', t('err_body')) : new AdminError(400, 'invalid', t('err_body'))
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminError(400, 'invalid', t('err_body'))
      let result
      try {
        result = await auth.provisionKosmy(target, { name: body.name, email: body.email, role: body.role, limits: body.values }, { actor: me.kosmy.sub, linkByEmail: true })
      } catch (err) {
        throw provisionError(err, t) || err
      }
      const { status, user } = result
      log(`  Kosmy Board users: "${me.username}" ${status} "${user.username}" (${user.role})`)
      json(res, 200, { ok: true, status, account: user.username, message: t(status, { name: user.username }) })
    } catch (err) {
      if (err instanceof AdminError) {
        json(res, err.status, { error: err.code, ...(err.userMessage ? { message: err.userMessage } : {}) }, err.allow ? { allow: err.allow } : {})
      } else {
        log(`  Kosmy Board users: ${err.stack || err.message}`)
        if (!res.headersSent) json(res, 500, { error: 'server_error', message: t('err_error') })
      }
    }
    return true
  }

  return { handle }
}
