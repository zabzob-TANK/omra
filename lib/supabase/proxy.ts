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
  //
  // Le Proxy tourne sur chaque requête et reste donc le seul endroit capable
  // de persister un jeton rafraîchi dans un cookie de réponse : un composant
  // serveur ne le peut pas (voir `lib/supabase/server.ts`). Sans cet appel,
  // le jeton de session Facturation n'est jamais renouvelé et la moindre
  // expiration (jeton d'accès ~1h) casse la session sans retour possible
  // avant reconnexion manuelle.
  //
  // getUser() peut lever sur un jeton corrompu ou révoqué (même remarque
  // qu'en Admin plus bas) : capturé sans autre effet. Une seule tentative,
  // jamais de retry ici — un jeton irrécupérable doit échouer proprement en
  // aval (page.tsx / RPC), pas boucler dans le Proxy.
  if (isBillingPath) {
    try {
      await supabase.auth.getUser()
    } catch {
      // Rafraîchissement impossible : la requête continue avec les cookies
      // déjà présents, jamais de nouvelle tentative ni de déconnexion ici.
    }
    return response
  }

  // À partir d'ici : uniquement /admin* et /login, univers Administration,
  // identifié par `admin_accounts` — jamais par `account_slots`.
  //
  // Un jeton de rafraîchissement périmé, révoqué ou corrompu peut faire
  // lever `getUser()` au lieu de simplement renvoyer une erreur (selon les
  // versions du client Supabase). Le Proxy tourne sur chaque requête
  // /admin* et /login : une exception non rattrapée ici plante la requête
  // entière (500), pas seulement une page. Traité exactement comme une
  // absence de session, et le cookie invalide est nettoyé (`signOut()`) —
  // sans quoi la même erreur se reproduirait à chaque requête suivante.
  let utilisateur: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] | null = null
  let jetonInvalide = false
  try {
    const { data, error } = await supabase.auth.getUser()
    utilisateur = data.user
    jetonInvalide = Boolean(error) && !data.user
  } catch {
    jetonInvalide = true
  }

  if (!utilisateur) {
    // Ne nettoyer le cookie que si une session invalide a réellement été
    // rencontrée — jamais pour une simple visite anonyme sans cookie du tout.
    // `signOut()` sur un jeton déjà invalide lève lui-même (« Invalid
    // Refresh Token: Refresh Token Not Found ») : le but ici est seulement de
    // nettoyer un cookie mort, pas d'exiger qu'il l'était encore un instant
    // avant — sans ce filet, cette exception plantait la requête entière sur
    // *chaque* visite à /admin ou /login tant que le cookie périmé restait là.
    if (jetonInvalide) {
      try {
        await supabase.auth.signOut()
      } catch {
        // Déjà invalide : rien de plus à nettoyer côté serveur Supabase.
      }
    }
    if (isLoginPath) {
      return response
    }
    return versLogin()
  }

  const compteAdmin = await findActiveAdminAccountByAuthUserId(utilisateur.id)

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
