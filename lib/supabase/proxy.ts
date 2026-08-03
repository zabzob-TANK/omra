import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { findActiveAdminAccountByAuthUserId } from '@/lib/admin-access'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  let isRedirectResponse = false

  /**
   * Un redirect doit repartir avec les cookies déjà accumulés sur `response`
   * (ex. un jeton de session rafraîchi par `getUser()` juste avant) — jamais
   * une réponse vierge, sous peine de perdre ce rafraîchissement.
   */
  function versLogin(): NextResponse {
    isRedirectResponse = true
    const cible = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.getAll().forEach((cookie) => cible.cookies.set(cookie))
    return cible
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          if (!isRedirectResponse) {
            response = NextResponse.next({ request })
          }
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const isAdminPath =
    request.nextUrl.pathname === '/admin' ||
    request.nextUrl.pathname.startsWith('/admin/')
  const isBillingPath =
    request.nextUrl.pathname === '/facturation' ||
    request.nextUrl.pathname.startsWith('/facturation/')
  const isLoginPath = request.nextUrl.pathname === '/login'

  if (!isAdminPath && !isBillingPath && !isLoginPath) {
    return response
  }

  // Séparation étanche Facturation/Administration : la Facturation gère
  // entièrement sa propre session et son propre écran de connexion — le
  // Proxy ne doit ni la rediriger vers /login, ni la déconnecter. C'est
  // `app/facturation/page.tsx` qui décide seul de ce qu'il affiche.
  if (isBillingPath) {
    return response
  }

  // À partir d'ici : uniquement /admin* et /login, univers Administration,
  // identifié par `admin_accounts` — jamais par `account_slots`.
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    if (isLoginPath) {
      return response
    }
    return versLogin()
  }

  const compteAdmin = await findActiveAdminAccountByAuthUserId(data.user.id)

  if (!compteAdmin) {
    if (isLoginPath) {
      return response
    }
    // Ne jamais déconnecter ici : la session peut être une session
    // Facturation valide qui vient seulement de taper la mauvaise URL.
    return versLogin()
  }

  return response
}
