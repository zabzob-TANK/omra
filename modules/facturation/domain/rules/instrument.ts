/**
 * Instrument de paiement : espèces, chèque ou virement, unique ou partagé.
 *
 * Couvre : R-23, R-24, R-25, R-26, R-27, R-28.
 */

import { NATURE_ESPECES } from '../constants'
import { dateFrValide } from '../dates'
import { dirhamsSaisisEnCentimes } from '../money'
import { natureNormalisee } from '../payment-method'
import type { OperationPartagee, Recu } from '../types'
import type { ErreurValidation } from './errors'
import { etatOperation } from './shared-payment'

/** Portée choisie dans le formulaire. */
export type PorteeChoisie = 'unique' | 'shared'
/** Origine d'une opération partagée : nouvelle ou déjà enregistrée. */
export type SourceOperation = 'new' | 'existing'

/** Champs d'instrument communs aux formulaires de création et de versement. */
export interface SaisieInstrument {
  /** Nature du paiement. */
  nature: string
  portee: PorteeChoisie
  sourceOperation: SourceOperation
  /** Identifiant de l'opération existante choisie. */
  operationId: string
  /** Numéro de chèque ou référence de virement. */
  reference: string
  /** Date de l'instrument, `jj/mm/aaaa`. */
  dateInstrument: string
  banque: string
  /** Personne ayant effectué le paiement partagé. */
  payeur: string
  /** Montant total de l'opération partagée, saisi en dirhams. */
  montantOperation: string
}

/**
 * R-23 à R-26 — Validation des champs d'instrument.
 *
 * Reproduit `validateInstrument()`, y compris ses sorties anticipées :
 *  - espèces : aucun contrôle, aucun champ requis ;
 *  - opération partagée existante : seul l'identifiant est exigé, et la
 *    validation **s'arrête là** — les champs de l'instrument viennent de
 *    l'opération, pas du formulaire ;
 *  - sinon : référence, date et banque obligatoires, date au format strict ;
 *  - opération partagée nouvelle : payeur et montant total en plus.
 *
 * Les erreurs sont ajoutées à la liste reçue, dans l'ordre du fichier de référence.
 */
export function validerInstrument(saisie: SaisieInstrument, liste: ErreurValidation[]): void {
  if (natureNormalisee(saisie.nature) === NATURE_ESPECES) return

  const partage = saisie.portee === 'shared'

  // R-24 — opération existante : l'identifiant suffit, on s'arrête.
  if (partage && saisie.sourceOperation === 'existing') {
    if (!saisie.operationId) {
      liste.push({ champ: 'operationId', code: 'operation-partagee-obligatoire' })
    }
    return
  }

  // R-25 — champs de l'instrument.
  if (!saisie.reference.trim()) {
    liste.push({ champ: 'reference', code: 'reference-instrument-obligatoire' })
  }
  if (!saisie.dateInstrument.trim()) {
    liste.push({ champ: 'dateInstrument', code: 'date-instrument-obligatoire' })
  } else if (!dateFrValide(saisie.dateInstrument)) {
    liste.push({ champ: 'dateInstrument', code: 'date-instrument-invalide' })
  }
  if (!saisie.banque.trim()) {
    liste.push({ champ: 'banque', code: 'banque-obligatoire' })
  }

  // R-26 — champs propres à une nouvelle opération partagée.
  if (partage) {
    if (!saisie.payeur.trim()) {
      liste.push({ champ: 'payeur', code: 'payeur-obligatoire' })
    }
    if (!saisie.montantOperation.trim()) {
      liste.push({ champ: 'montantOperation', code: 'montant-operation-obligatoire' })
    } else if (dirhamsSaisisEnCentimes(saisie.montantOperation) <= 0) {
      liste.push({ champ: 'montantOperation', code: 'montant-operation-doit-etre-positif' })
    }
  }
}

/** Instrument résolu, prêt à être porté par un versement. */
export interface InstrumentPrepare {
  portee: 'unique' | 'shared'
  reference: string
  dateInstrument: string
  banque: string
  payeur: string
  /** Montant total de l'opération partagée, en centimes. 0 si unique. */
  montantOperationCentimes: number
  operationPartageeId: string
  /** Opération à créer, ou `null` si elle existe déjà ou n'est pas nécessaire. */
  nouvelleOperation: OperationPartagee | null
  /**
   * Montant encore attribuable sur l'opération.
   * `Infinity` pour un instrument unique : aucun plafond ne s'applique.
   */
  disponibleCentimes: number
}

export interface ContextePreparation {
  operations: readonly OperationPartagee[]
  recus: readonly Recu[]
  /** Identifiant à donner à une nouvelle opération. */
  nouvelIdOperation: () => string
  /** Horodatage de création. */
  horodatage: string
  /** Employé enregistrant l'opération. */
  employe: string
}

/**
 * R-23, R-27, R-28 — Résout l'instrument choisi.
 *
 * Reproduit `prepareInstrument()`. Renvoie `null` lorsque l'opération partagée
 * désignée n'existe pas — le fichier de référence produit alors une erreur sur
 * le champ de sélection.
 */
export function preparerInstrument(
  saisie: SaisieInstrument,
  contexte: ContextePreparation,
): InstrumentPrepare | null {
  const nature = natureNormalisee(saisie.nature)

  // R-23 — espèces : aucun instrument, aucun plafond.
  if (nature === NATURE_ESPECES) {
    return instrumentUnique('', '', '')
  }

  // Instrument bancaire non partagé : les champs sont repris, sans plafond.
  if (saisie.portee !== 'shared') {
    return instrumentUnique(
      saisie.reference.trim(),
      saisie.dateInstrument.trim(),
      saisie.banque.trim(),
    )
  }

  // R-27 — opération existante : le disponible est son restant.
  if (saisie.sourceOperation === 'existing') {
    const operation = contexte.operations.find((o) => o.id === saisie.operationId)
    if (!operation) return null
    const etat = etatOperation(operation, contexte.recus)
    return {
      portee: 'shared',
      reference: operation.reference || '',
      dateInstrument: operation.dateInstrument || '',
      banque: operation.banque || '',
      payeur: operation.payeur || '',
      montantOperationCentimes: operation.montantTotalCentimes,
      operationPartageeId: operation.id,
      nouvelleOperation: null,
      disponibleCentimes: etat.restantCentimes,
    }
  }

  // R-28 — nouvelle opération : le disponible est son montant total.
  const total = dirhamsSaisisEnCentimes(saisie.montantOperation)
  const operation: OperationPartagee = {
    id: contexte.nouvelIdOperation(),
    nature,
    reference: saisie.reference.trim(),
    dateInstrument: saisie.dateInstrument.trim(),
    banque: saisie.banque.trim(),
    payeur: saisie.payeur.trim(),
    montantTotalCentimes: total,
    creeeLe: contexte.horodatage,
    creeePar: contexte.employe,
    statut: 'active',
    image: null,
  }

  return {
    portee: 'shared',
    reference: operation.reference,
    dateInstrument: operation.dateInstrument,
    banque: operation.banque,
    payeur: operation.payeur,
    montantOperationCentimes: total,
    operationPartageeId: operation.id,
    nouvelleOperation: operation,
    disponibleCentimes: total,
  }
}

function instrumentUnique(
  reference: string,
  dateInstrument: string,
  banque: string,
): InstrumentPrepare {
  return {
    portee: 'unique',
    reference,
    dateInstrument,
    banque,
    payeur: '',
    montantOperationCentimes: 0,
    operationPartageeId: '',
    nouvelleOperation: null,
    disponibleCentimes: Number.POSITIVE_INFINITY,
  }
}
