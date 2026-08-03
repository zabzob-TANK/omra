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

export async function requireActiveAccount(): Promise<ActiveAccount> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    throw new AccountAuthorizationError()
  }

  const account = await findActiveAccountByAuthUserId(data.user.id)

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
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    throw new AdminAuthorizationError()
  }

  const compteAdmin = await findActiveAdminAccountByAuthUserId(data.user.id)
  if (!compteAdmin) {
    throw new AdminAuthorizationError()
  }
}
