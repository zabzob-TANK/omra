/**
 * Sélection de la source de données.
 *
 * C'est le **point de bascule unique** entre la démonstration et la persistance
 * réelle. Aucun autre fichier du module ne connaît l'implémentation employée :
 * le métier et l'interface ne voient que `SourceDonnees`.
 *
 * Bascule pilotée par `FACTURATION_SOURCE` :
 *  - `demo` (défaut) — adaptateur en mémoire, aucun secret requis ;
 *  - `supabase` — projet Supabase **de test**, dédié à cette reconstruction.
 *
 * ⚠️ La base du projet officiel Omra n'est jamais une cible valide de ce module.
 */

import type { SourceDonnees } from './ports'
import { creerSourceDemonstration } from './demo/adapter'

export type NomSourceDonnees = 'demo' | 'supabase'

export function sourceConfiguree(): NomSourceDonnees {
  const valeur = process.env.FACTURATION_SOURCE
  return valeur === 'supabase' ? 'supabase' : 'demo'
}

/** Vrai lorsque l'application tourne sur données fictives — sert au bandeau d'avertissement. */
export function modeDemonstration(): boolean {
  return sourceConfiguree() === 'demo'
}

let instance: SourceDonnees | null = null

/**
 * Renvoie la source de données de l'application.
 *
 * L'instance est mémorisée pour que l'adaptateur de démonstration conserve son
 * état d'une requête à l'autre pendant le développement.
 */
export function sourceDonnees(): SourceDonnees {
  if (instance) return instance

  if (sourceConfiguree() === 'demo' && process.env.NODE_ENV === 'production') {
    throw new Error(
      'FACTURATION_SOURCE=demo est interdit en production. ' +
        'Configurez FACTURATION_SOURCE=supabase avec un projet Supabase valide.',
    )
  }

  if (sourceConfiguree() === 'supabase') {
    // L'adaptateur Supabase sera ajouté lorsque la persistance réelle deviendra
    // nécessaire. Il implémentera `SourceDonnees` sans modifier ni le domaine
    // ni l'interface. Les migrations correspondantes sont déjà versionnées dans
    // `db/facturation/migrations/`.
    throw new Error(
      "FACTURATION_SOURCE=supabase : l'adaptateur Supabase n'est pas encore branché. " +
        'Utilisez FACTURATION_SOURCE=demo, ou implémentez SourceDonnees dans data/supabase/.',
    )
  }

  // Scénario de démonstration. Le jeu volumineux servant à vérifier
  // l'impression sur plusieurs pages ne s'active que sur demande explicite,
  // par `FACTURATION_DEMO_SCENARIO=pagination`.
  const scenario = process.env.FACTURATION_DEMO_SCENARIO === 'pagination' ? 'pagination' : 'standard'
  instance = creerSourceDemonstration({ scenario })
  return instance
}

/** Réinitialise l'instance mémorisée. Réservé aux tests et à `demo:reset`. */
export function reinitialiserSourceDonnees(): void {
  instance = null
}

export type { SourceDonnees } from './ports'
export { creerSourceDemonstration } from './demo/adapter'
