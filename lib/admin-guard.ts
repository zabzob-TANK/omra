import 'server-only'

import {
  findActiveAccountByAuthUserId,
  type ActiveAccount,
} from '@/lib/account-access'
import { findActiveAdminAccountByAuthUserId } from '@/lib/admin-access'
import { createClient } from '@/lib/supabase/server'

export class AccountAuthorizationError extends Error {
  constructor() {
    super('Active account authorization failed')
    this.name = 'AccountAuthorizationError'
  }
}

export class AdminAuthorizationError extends Error {
  constructor() {
    super('Admin authorization failed')
    this.name = 'AdminAuthorizationError'
  }
}

/**
 * `getUser()` sécurisé : un jeton de rafraîchissement périmé, révoqué ou
 * corrompu peut le faire lever au lieu de simplement renvoyer une erreur
 * (comportement observé selon les versions du client Supabase). Les deux
 * gardes ci-dessous doivent traiter ce cas exactement comme une absence de
 * session — jamais de page plantée.
 */
async function utilisateurAuthActifOuNull(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    return data.user
  } catch {
    return null
  }
}

export async function requireActiveAccount(): Promise<ActiveAccount> {
  const supabase = await createClient()
  const utilisateur = await utilisateurAuthActifOuNull(supabase)

  if (!utilisateur) {
    throw new AccountAuthorizationError()
  }

  const account = await findActiveAccountByAuthUserId(utilisateur.id)

  if (!account) {
    throw new AccountAuthorizationError()
  }

  return account
}

/**
 * Identité Administration — `admin_accounts`, une table distincte des 6
 * emplacements Facturation (`account_slots`). Séparation étanche
 * Facturation/Administration : le slot 1 (opérateur Facturation avec
 * privilèges internes élevés) n'ouvre plus `/admin`.
 */
export async function requireAdministrator(): Promise<void> {
  await requireAdministratorAccount()
}

/**
 * Même garde, mais rend l'identité de l'administrateur connecté.
 *
 * Nécessaire aux opérations qui doivent lui REDEMANDER son propre mot de
 * passe avant d'agir — réinitialiser le mot de passe d'un employé, par
 * exemple. `requireAdministrator()` reste la porte par défaut : on ne
 * réclame cette identité que lorsqu'on va s'en servir.
 */
export async function requireAdministratorAccount(): Promise<{
  authUserId: string
  login: string
}> {
  const supabase = await createClient()
  const utilisateur = await utilisateurAuthActifOuNull(supabase)

  if (!utilisateur) {
    throw new AdminAuthorizationError()
  }

  const compteAdmin = await findActiveAdminAccountByAuthUserId(utilisateur.id)
  if (!compteAdmin) {
    throw new AdminAuthorizationError()
  }

  return { authUserId: compteAdmin.auth_user_id, login: compteAdmin.login }
}
