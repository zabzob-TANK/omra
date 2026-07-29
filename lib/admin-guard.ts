import 'server-only'

import { isTestAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export class AdminAuthorizationError extends Error {
  constructor() {
    super('Admin authorization failed')
    this.name = 'AdminAuthorizationError'
  }
}

export async function requireAdministrator() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    throw new AdminAuthorizationError()
  }

  if (isTestAdmin(data.user)) {
    return data.user
  }

  const admin = createAdminClient()
  const { data: slot, error: slotError } = await admin
    .from('account_slots')
    .select('slot_number')
    .eq('auth_user_id', data.user.id)
    .eq('slot_number', 1)
    .eq('active', true)
    .maybeSingle()

  if (slotError || !slot) {
    throw new AdminAuthorizationError()
  }

  return data.user
}
