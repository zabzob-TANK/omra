'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MARQUEUR_ONGLET, sessionParOnglet } from '@/lib/session-garde'

/**
 * Lie la session de l'Administration à l'ONGLET.
 *
 * Demandé par le commanditaire : ouvrir un nouvel onglet doit redemander le
 * mot de passe, rafraîchir non. Le marqueur vit dans le `sessionStorage`, qui
 * est propre à chaque onglet : un onglet neuf ne l'a pas et repart donc vers
 * l'écran de connexion.
 *
 * Deux limites à connaître, et elles sont assumées :
 *
 *  - la vérification se fait dans le navigateur, donc elle se contourne avec
 *    les outils de développement. Ce n'est PAS une barrière de sécurité, c'est
 *    une mesure d'hygiène contre le « je clique sur le lien et je suis dedans ».
 *    La vraie protection reste la durée d'inactivité, appliquée par le serveur ;
 *  - les navigateurs qui rouvrent les onglets de la veille restaurent aussi ce
 *    marqueur. La restauration de session reste donc le trou connu.
 *
 * Ce composant ne DÉCONNECTE jamais : il renvoie seulement cet onglet-ci vers
 * la connexion. Déconnecter effacerait le cookie partagé et jetterait dehors
 * les autres onglets, où quelqu'un est peut-être en train de travailler.
 */
export function SessionOnglet() {
  const router = useRouter()
  const parametres = useSearchParams()

  useEffect(() => {
    if (!sessionParOnglet()) return

    let memoire: Storage | null = null
    try {
      memoire = window.sessionStorage
    } catch {
      // Stockage refusé par le navigateur : on ne bloque pas l'accès pour
      // autant, la durée d'inactivité continue de protéger.
      return
    }
    if (!memoire) return

    // La connexion vient d'aboutir : cet onglet a le droit d'être là.
    if (parametres.get('ouverture') === '1') {
      try {
        memoire.setItem(MARQUEUR_ONGLET, '1')
      } catch {
        return
      }
      // On retire le paramètre pour qu'un rafraîchissement ne le rejoue pas
      // et qu'il ne traîne pas dans l'historique ou un favori.
      router.replace(window.location.pathname)
      return
    }

    if (memoire.getItem(MARQUEUR_ONGLET) !== '1') {
      router.replace('/login?error=onglet')
    }
  }, [parametres, router])

  return null
}
