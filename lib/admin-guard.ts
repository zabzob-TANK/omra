import 'server-only'

import { isTestAdmin } from '@/lib/auth'
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

  if (error || !data.user || !isTestAdmin(data.user)) {
    throw new AdminAuthorizationError()
  }

  return data.user
}
