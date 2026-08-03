/**
 * Sélection de la source de données.
 *
 * C'est le **point de bascule unique** entre la démonstration et la persistance
 * réelle. Aucun autre fichier du module ne connaît l'implémentation employée :
 * le métier et l'interface ne voient que `SourceDonnees`.
 *
 * Bascule pilotée par `FACTURATION_SOURCE` :
 *  - `demo` (défaut) — adaptateur en mémoire, aucun secret requis ;
 *  - `supabase` — le projet Supabase réel du projet officiel omra
 *    (`modules/facturation/data/supabase/`), branché sur ses RPC sécurisées
 *    existantes.
 *
 * En dehors du développement local, `FACTURATION_SOURCE` doit toujours valoir
 * `supabase` : la garde ci-dessous refuse `demo` en production (reprise.md
 * §5.13), mais un environnement de développement mal configuré resterait sur
 * de fausses données sans avertissement.
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
    // Import différé (`require`, pas d'`import` statique) : les fichiers de
    // `./supabase` portent `import 'server-only'`, qui lève dès qu'il est
    // chargé hors du bundler Next.js. Un `import` statique ici forcerait ce
    // chargement même pour des tests qui n'exercent jamais cette branche
    // (`service.test.ts`, entièrement bâti sur l'adaptateur de démonstration).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sourceSupabase } = require('./supabase') as typeof import('./supabase')
    instance = sourceSupabase
    return instance
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
