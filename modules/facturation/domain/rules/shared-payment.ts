/**
 * Opérations de paiement partagées.
 *
 * Couvre : R-29, R-30, R-31, R-32, R-33.
 *
 * Une opération partagée est un chèque ou un virement unique réglant plusieurs
 * reçus. Elle reste **une seule opération financière** : les parts attribuées
 * aux reçus ne s'additionnent jamais au montant de l'opération.
 *
 * La règle exacte de répartition n'étant pas arrêtée, aucune méthode automatique
 * n'est imposée : l'allocation reste libre, et seul le dépassement déclenche une
 * confirmation.
 */

import { centimesEnTexteDevise } from '../money'
import { natureNormalisee } from '../payment-method'
import type { OperationPartagee, Versement } from '../types'

/**
 * Décision de performance (2026-08-09) : ces trois fonctions n'ont jamais eu
 * besoin que du couple `operationPartageeId`/`montantCentimes` d'un
 * versement, jamais du reçu porteur — elles s'alimentaient d'un `Recu[]`
 * complet uniquement parce qu'aucune source plus légère n'existait encore.
 * `contexteCommun()` (service.ts) alimente désormais ce paramètre depuis
 * `list_billing_season_payments`, jamais depuis un chargement complet de
 * tous les reçus de la saison à chaque écriture.
 */
type VersementPourAllocation = Pick<Versement, 'operationPartageeId' | 'montantCentimes'>

export interface EtatOperation {
  /** Montant total de l'opération, en centimes. */
  totalCentimes: number
  /** R-29 — Somme des parts déjà attribuées. */
  attribueCentimes: number
  /** R-30 — Reste disponible. Peut être négatif après un dépassement confirmé. */
  restantCentimes: number
}

/**
 * R-29 — Total attribué à une opération.
 *
 * Reproduit `sharedAllocated()` : parcourt tous les versements de tous les
 * reçus et additionne ceux qui portent l'identifiant de l'opération.
 *
 * Les reçus annulés sont inclus, comme dans le fichier de référence : un
 * versement annulé reste rattaché à son opération.
 */
export function totalAttribue(versements: readonly VersementPourAllocation[], operationId: string): number {
  let total = 0
  for (const versement of versements) {
    if (versement.operationPartageeId === operationId) total += versement.montantCentimes
  }
  return total
}

/**
 * R-30 — État complet d'une opération.
 * Reproduit `sharedStats()`.
 */
export function etatOperation(
  operation: Pick<OperationPartagee, 'id' | 'montantTotalCentimes'> | null,
  versements: readonly VersementPourAllocation[],
): EtatOperation {
  const totalCentimes = operation ? operation.montantTotalCentimes : 0
  const attribueCentimes = operation ? totalAttribue(versements, operation.id) : 0
  return {
    totalCentimes,
    attribueCentimes,
    restantCentimes: totalCentimes - attribueCentimes,
  }
}

export interface OptionOperation {
  id: string
  /** Libellé affiché dans la liste de choix. */
  libelle: string
  etat: EtatOperation
}

/**
 * R-31 — Opérations proposées au rattachement.
 *
 * Reproduit `sharedOptions()`, dans cet ordre exact :
 *  1. même nature de paiement que celle choisie ;
 *  2. non archivée ;
 *  3. restant strictement positif — sauf celle déjà sélectionnée, qui reste
 *     visible même à zéro pour ne pas disparaître du formulaire ;
 *  4. tri par date de création décroissante.
 */
export function optionsOperations(
  operations: readonly OperationPartagee[],
  versements: readonly VersementPourAllocation[],
  nature: string,
  idSelectionne = '',
): OptionOperation[] {
  const natureCible = natureNormalisee(nature)

  return operations
    .filter((operation) => natureNormalisee(operation.nature) === natureCible)
    .filter((operation) => operation.statut !== 'archived')
    .map((operation) => ({ operation, etat: etatOperation(operation, versements) }))
    .filter((x) => x.etat.restantCentimes > 0 || x.operation.id === idSelectionne)
    .sort((a, b) => String(b.operation.creeeLe).localeCompare(String(a.operation.creeeLe)))
    .map((x) => ({
      id: x.operation.id,
      libelle: libelleOption(x.operation, x.etat),
      etat: x.etat,
    }))
}

function libelleOption(operation: OperationPartagee, etat: EtatOperation): string {
  const prefixe = natureNormalisee(operation.nature) === 'شيك' ? 'Chèque' : 'Virement'
  const reference = operation.reference || '—'
  const banque = operation.banque || '—'
  return `${prefixe} ${reference} · ${banque} · restant ${centimesEnTexteDevise(etat.restantCentimes)}`
}

/**
 * R-32 — Un montant dépassant le restant disponible est autorisé, mais exige une
 * confirmation explicite. L'écart n'est pas corrigé : il est conservé tel quel
 * dans les données.
 */
export function depasseLeRestant(montantCentimes: number, disponibleCentimes: number): boolean {
  return montantCentimes > disponibleCentimes
}

/**
 * R-33 — Aucune surveillance automatique des doublons.
 *
 * Le fichier de référence l'énonce explicitement dans l'interface de
 * confirmation : « aucune surveillance automatique des opérations dupliquées ».
 * Cette fonction existe pour rendre la règle explicite et testable : deux
 * opérations de mêmes caractéristiques sont acceptées sans alerte.
 */
export function detecteLesDoublons(): false {
  return false
}
