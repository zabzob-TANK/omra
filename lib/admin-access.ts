import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export type ActiveAdminAccount = {
  login: string
  auth_user_id: string
}

/**
 * Résout l'identité Administration, distincte des 6 emplacements Facturation
 * (`account_slots`). Miroir de `findActiveAccountByAuthUserId`
 * (`lib/account-access.ts`), mais sur une table totalement séparée : aucune
 * clé étrangère, aucun `slot_number` — les deux mondes ne partagent que
 * `auth.users`.
 */
export async function findActiveAdminAccountByAuthUserId(
  authUserId: string,
): Promise<ActiveAdminAccount | null> {
  if (!authUserId) {
    return null
  }

  const admin = createAdminClient()
  const { data: compte, error } = await admin
    .from('admin_accounts')
    .select('login, auth_user_id')
    .eq('auth_user_id', authUserId)
    .eq('active', true)
    .single()

  if (
    error ||
    !compte ||
    typeof compte.login !== 'string' ||
    compte.auth_user_id !== authUserId
  ) {
    return null
  }

  return { login: compte.login, auth_user_id: compte.auth_user_id }
}
