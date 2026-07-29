import 'server-only'

import { createClient } from '@supabase/supabase-js'

export function hasServiceRoleKey() {
  return Boolean(process.env.SUPABASE_SECRET_KEY)
}

export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!secretKey) {
    throw new Error('SUPABASE_SECRET_KEY manquante')
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
