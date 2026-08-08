/**
 * Calculs de base sur un reçu.
 *
 * Couvre : U-05, U-06.
 */

import { STATUT_ANNULE, STATUT_INCOMPLET, STATUT_SOLDE } from '../constants'
import type { Recu, StatutAffiche, Versement } from '../types'

/**
 * U-05 — Total déjà payé, en centimes.
 * Reproduit `paye()` : somme de tous les versements, sans exception.
 *
 * Un reçu annulé conserve ses versements (R-45), donc son total payé reste
 * calculable — c'est ce dont dépend le montant remboursé (R-46).
 */
export function totalPaye(recu: Pick<Recu, 'versements'>): number {
  return recu.versements.reduce((somme, v) => somme + v.montantCentimes, 0)
}

/**
 * U-05 — Restant dû, en centimes.
 * Reproduit `rest()` : convenu − payé.
 *
 * Le fichier de référence n'écrête pas cette valeur à zéro : elle peut être
 * négative si les données le permettent. Comportement conservé.
 */
export function restantDu(recu: Pick<Recu, 'convenuCentimes' | 'versements'>): number {
  return recu.convenuCentimes - totalPaye(recu)
}

/**
 * U-06 — Statut affiché.
 *
 * Décision du commanditaire (2026-08-08, reprise.md §5.11 à la lettre) :
 * l'annulation l'emporte sur tout le reste, puis un restant ≤ 0 vaut
 * « soldé », sinon « incomplet ». Comparaison `<= 0`, plus jamais `=== 0` :
 * un restant négatif (trop-perçu) est désormais « soldé » comme n'importe
 * quel restant nul — la visibilité du trop-perçu ne repose plus sur ce
 * statut. `Recu.anomalies` (traduit de `active_anomalies`, voir
 * `data/supabase/mappers.ts`) la porte maintenant de façon indépendante,
 * affichée en rouge partout où ce statut apparaît.
 */
export function statutAffiche(recu: Pick<Recu, 'statut' | 'convenuCentimes' | 'versements'>): StatutAffiche {
  if (recu.statut === STATUT_ANNULE) return STATUT_ANNULE
  return restantDu(recu) <= 0 ? STATUT_SOLDE : STATUT_INCOMPLET
}

/** Dernier versement enregistré, ou `null`. */
export function dernierVersement(recu: Pick<Recu, 'versements'>): Versement | null {
  return recu.versements.length ? recu.versements[recu.versements.length - 1] : null
}

/**
 * Symbole de situation figé dans l'instantané d'un versement.
 * Reproduit `statusAfter` : '✓' si le reçu est soldé après ce versement
 * (restant ≤ 0, même règle que `statutAffiche` — voir sa note), sinon '•'.
 */
export function symboleSituation(restantApresCentimes: number): '✓' | '•' {
  return restantApresCentimes <= 0 ? '✓' : '•'
}
