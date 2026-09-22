import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { optionsCookieSession } from '@/lib/session-garde'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              // C'est ICI que la connexion écrit le cookie d'authentification :
              // sans cette règle, la session survivait à la fermeture du
              // navigateur malgré le réglage du déploiement.
              cookieStore.set(name, value, optionsCookieSession(options)),
            )
          } catch {
            // Server Components cannot write cookies; proxy.ts refreshes them.
          }
        },
      },
    },
  )
}
