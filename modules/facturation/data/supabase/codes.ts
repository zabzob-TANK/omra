/**
 * Traduction des codes entre la base (anglais) et le domaine (arabe).
 *
 * Règle absolue : jamais d'arabe stocké dans une colonne de code, jamais de
 * code anglais montré à l'écran. La traduction est bidirectionnelle et vit
 * uniquement ici. Une valeur inconnue lève une erreur — elle n'est jamais
 * transmise telle quelle, contrairement à `natureNormalisee()` côté domaine
 * qui tolère des graphies libres pour des données de démonstration.
 */

import { NATURE_CHEQUE, NATURE_ESPECES, NATURE_VIREMENT } from '../../domain/constants'
import type { NaturePaiement } from '../../domain/payment-method'
import type { ModeRemboursement, StatutRecu } from '../../domain/types'

/** `payment_mode` en base. */
export type ModePaiementBase = 'cash' | 'cheque' | 'transfer'

const MODE_VERS_NATURE: Record<ModePaiementBase, NaturePaiement> = {
  cash: NATURE_ESPECES,
  cheque: NATURE_CHEQUE,
  transfer: NATURE_VIREMENT,
}

const NATURE_VERS_MODE: Record<NaturePaiement, ModePaiementBase> = {
  [NATURE_ESPECES]: 'cash',
  [NATURE_CHEQUE]: 'cheque',
  [NATURE_VIREMENT]: 'transfer',
}

/** Base → domaine. Lève une erreur sur un code inconnu. */
export function natureDepuisModePaiement(mode: string): NaturePaiement {
  const nature = MODE_VERS_NATURE[mode as ModePaiementBase]
  if (!nature) {
    throw new Error(`Mode de paiement inconnu reçu de la base : ${JSON.stringify(mode)}`)
  }
  return nature
}

/** Domaine → base. Lève une erreur sur une nature inconnue. */
export function modePaiementDepuisNature(nature: NaturePaiement): ModePaiementBase {
  const mode = NATURE_VERS_MODE[nature]
  if (!mode) {
    throw new Error(`Nature de paiement inconnue à traduire vers la base : ${JSON.stringify(nature)}`)
  }
  return mode
}

/** `lifecycle_status` en base. */
export type StatutBase = 'active' | 'cancelled'

const STATUT_BASE_VERS_DOMAINE: Record<StatutBase, StatutRecu> = {
  active: 'نشط',
  cancelled: 'ملغى',
}

const STATUT_DOMAINE_VERS_BASE: Record<StatutRecu, StatutBase> = {
  نشط: 'active',
  ملغى: 'cancelled',
}

/** Base → domaine. Lève une erreur sur un statut inconnu. */
export function statutDepuisLifecycle(statut: string): StatutRecu {
  const traduit = STATUT_BASE_VERS_DOMAINE[statut as StatutBase]
  if (!traduit) {
    throw new Error(`Statut de reçu inconnu reçu de la base : ${JSON.stringify(statut)}`)
  }
  return traduit
}

/** Domaine → base. Lève une erreur sur un statut inconnu. */
export function lifecycleDepuisStatut(statut: StatutRecu): StatutBase {
  const traduit = STATUT_DOMAINE_VERS_BASE[statut]
  if (!traduit) {
    throw new Error(`Statut de reçu inconnu à traduire vers la base : ${JSON.stringify(statut)}`)
  }
  return traduit
}

/** `restitution_route` en base (`receipt_cancellations`). */
export type RouteRestitutionBase = 'cash_register' | 'outside_register'

const ROUTE_VERS_MODE: Record<RouteRestitutionBase, ModeRemboursement> = {
  cash_register: 'cash',
  outside_register: 'none',
}

const MODE_VERS_ROUTE: Record<ModeRemboursement, RouteRestitutionBase> = {
  cash: 'cash_register',
  none: 'outside_register',
}

/** Base → domaine. Lève une erreur sur une route inconnue. */
export function modeRemboursementDepuisRoute(route: string): ModeRemboursement {
  const mode = ROUTE_VERS_MODE[route as RouteRestitutionBase]
  if (!mode) {
    throw new Error(`Route de restitution inconnue reçue de la base : ${JSON.stringify(route)}`)
  }
  return mode
}

/** Domaine → base. Lève une erreur sur un mode inconnu. */
export function routeDepuisModeRemboursement(mode: ModeRemboursement): RouteRestitutionBase {
  const route = MODE_VERS_ROUTE[mode]
  if (!route) {
    throw new Error(`Mode de remboursement inconnu à traduire vers la base : ${JSON.stringify(mode)}`)
  }
  return route
}
