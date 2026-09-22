import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { findActiveAdminAccountByAuthUserId } from '@/lib/admin-access'
import {
  COOKIE_FIN,
  COOKIE_GARDE,
  ecrireGarde,
  estPrechargement,
  finPrevue,
  limites,
  lireGarde,
  verdict,
  type Verdict,
} from '@/lib/session-garde'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  let isRedirectResponse = false
  const bornes = limites()

  /**
   * Un redirect doit repartir avec les cookies déjà accumulés sur `response`
   * (ex. un jeton de session rafraîchi par `getUser()` juste avant) — jamais
   * une réponse vierge, sous peine de perdre ce rafraîchissement.
   */
  function versLogin(motif?: string): NextResponse {
    isRedirectResponse = true
    const url = new URL('/login', request.url)
    if (motif) url.searchParams.set('error', motif)
    const cible = NextResponse.redirect(url)
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
            // `finAuNavigateur` : retirer la date d'expiration transforme le
            // cookie de session Supabase en cookie de session du navigateur,
            // effacé à sa fermeture. Sans cela, rouvrir le lien le lendemain
            // ramène directement dans l'application sans rien taper.
            response.cookies.set(
              name,
              value,
              bornes.finAuNavigateur
                ? { ...options, maxAge: undefined, expires: undefined }
                : options,
            ),
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

  /**
   * Applique les limites de durée à une session déjà authentifiée.
   *
   * Retourne `'valide'` quand la session continue — le cookie de garde est
   * alors rafraîchi — et le motif d'arrêt sinon. C'est l'appelant qui décide
   * quoi faire de cet arrêt : l'Administration redirige, la Facturation
   * laisse son propre écran reprendre la main.
   */
  async function appliquerGarde(): Promise<Verdict> {
    const maintenant = Date.now()
    const existant = await lireGarde(request.cookies.get(COOKIE_GARDE)?.value)
    const etat = existant ?? { debut: maintenant, vu: maintenant }

    if (existant) {
      const decision = verdict(existant, bornes, maintenant)
      if (decision !== 'valide') return decision
      // Un pré-chargement de Next.js n'est pas une action de l'utilisateur :
      // il ne doit pas repousser l'échéance d'inactivité.
      if (!estPrechargement(request.headers)) etat.vu = maintenant
    }

    const commun = {
      path: '/',
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      ...(bornes.finAuNavigateur
        ? {}
        : { maxAge: Math.ceil(bornes.maximumMs / 1000) }),
    }
    response.cookies.set(COOKIE_GARDE, await ecrireGarde(etat), {
      ...commun,
      httpOnly: true,
    })
    // Lisible par la page : sert uniquement à prévenir avant la coupure.
    response.cookies.set(COOKIE_FIN, String(finPrevue(etat, bornes)), {
      ...commun,
      httpOnly: false,
    })
    return 'valide'
  }

  /** Efface les traces de la garde quand la session s'arrête. */
  function effacerGarde() {
    response.cookies.delete(COOKIE_GARDE)
    response.cookies.delete(COOKIE_FIN)
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
    let utilisateurFacturation: Awaited<
      ReturnType<typeof supabase.auth.getUser>
    >['data']['user'] | null = null
    try {
      const { data } = await supabase.auth.getUser()
      utilisateurFacturation = data.user
    } catch {
      // Rafraîchissement impossible : la requête continue avec les cookies
      // déjà présents, jamais de nouvelle tentative ni de déconnexion ici.
    }

    if (utilisateurFacturation && (await appliquerGarde()) !== 'valide') {
      // Durée dépassée : on coupe la session, sans rediriger. L'écran de
      // connexion de la Facturation reprend la main de lui-même.
      try {
        await supabase.auth.signOut()
      } catch {
        // Jeton déjà invalide : rien de plus à nettoyer côté serveur.
      }
      effacerGarde()
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
    effacerGarde()
    if (isLoginPath) {
      return response
    }
    return versLogin()
  }

  // Session authentifiée : les limites de durée s'appliquent avant même de
  // vérifier le rôle, pour qu'une session trop vieille ne serve à rien.
  const decision = await appliquerGarde()
  if (decision !== 'valide') {
    try {
      await supabase.auth.signOut()
    } catch {
      // Jeton déjà invalide : rien de plus à nettoyer côté serveur.
    }
    effacerGarde()
    if (isLoginPath) {
      return response
    }
    return versLogin(decision === 'maximum' ? 'duree' : 'inactivite')
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
