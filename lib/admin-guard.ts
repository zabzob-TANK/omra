import 'server-only'

import {
  findActiveAccountByAuthUserId,
  type ActiveAccount,
} from '@/lib/account-access'
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

export async function requireAdministrator(): Promise<ActiveAccount> {
  let account: ActiveAccount

  try {
    account = await requireActiveAccount()
  } catch {
    throw new AdminAuthorizationError()
  }

  if (account.slot_number !== 1) {
    throw new AdminAuthorizationError()
  }

  return account
}
