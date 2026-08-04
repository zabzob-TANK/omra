/**
 * Ajout d'un versement à un reçu existant.
 *
 * Couvre : R-15 à R-22.
 *
 * L'ordre reproduit exactement `savePay()`. Les cinq premiers contrôles portent
 * sur le reçu et interrompent immédiatement ; viennent ensuite les erreurs
 * cumulées du formulaire, puis les contrôles de montant, isolés.
 */

import { MAX_VERSEMENTS, STATUT_ANNULE } from '../constants'
import { dirhamsSaisisEnCentimes } from '../money'
import type { OperationPartagee, Recu, Versement } from '../types'
import {
  erreur,
  erreurs,
  montantPourMessage,
  ok,
  type ErreurValidation,
  type Resultat,
} from './errors'
import {
  preparerInstrument,
  validerInstrument,
  type ContextePreparation,
  type SaisieInstrument,
} from './instrument'
import { restantDu, symboleSituation } from './receipt'
import { depasseLeRestant } from './shared-payment'

export interface SaisieVersement {
  /** Numéro du reçu, saisi en chiffres. */
  numeroRecu: string
  /**
   * reprise.md §5.3 — identifiant réel du reçu, verrouillé quand la fenêtre
   * s'ouvre depuis une ligne du registre. `numeroRecu` reste renseigné (pour
   * l'affichage et la validation « obligatoire ») mais la résolution du reçu
   * se fait par cet identifiant, jamais par le numéro seul, quand il est fourni.
   */
  recuId?: string
  /** Montant saisi en dirhams. */
  montant: string
  instrument: SaisieInstrument
}

export interface ResultatVersement {
  versement: Versement
  /** Opération partagée à enregistrer avant le versement, ou `null`. */
  nouvelleOperation: OperationPartagee | null
}

export interface ContexteVersement extends ContextePreparation {
  /** Identifiant du versement à créer. */
  idVersement: string
  /** Date du jour, `jj/mm/aaaa`. */
  date: string
  /** Heure `HH:MM`. */
  heure: string
  /** R-32 — Confirmation explicite d'un dépassement d'opération partagée. */
  depassementConfirme?: boolean
}

/**
 * R-15 à R-18 — Motif empêchant l'ajout d'un versement à ce reçu.
 *
 * Extrait pour être réutilisable par l'interface, qui affiche le même
 * avertissement dès la saisie du numéro, avant toute tentative
 * d'enregistrement.
 *
 * @returns `null` si l'ajout est possible.
 */
export function motifRefusVersement(recu: Recu | null): ErreurValidation | null {
  // R-15
  if (!recu) return { champ: 'numeroRecu', code: 'numero-recu-introuvable' }
  // R-16
  if (recu.statut === STATUT_ANNULE) return { champ: 'numeroRecu', code: 'recu-annule' }
  // R-17 — comparaison stricte à zéro, comme `rest(r)===0` du fichier de
  // référence : un restant négatif (trop-perçu, P13/§5.11) n'est pas
  // « déjà soldé », un nouveau versement reste tentable — R-21 le refusera
  // ensuite avec un message qui montre le restant réel (négatif), plus
  // informatif que « déjà soldé ».
  if (restantDu(recu) === 0) return { champ: 'numeroRecu', code: 'recu-deja-solde' }
  // R-18
  if (recu.versements.length >= MAX_VERSEMENTS) {
    return {
      champ: 'numeroRecu',
      code: 'nombre-maximal-de-versements-atteint',
      parametres: { maximum: MAX_VERSEMENTS },
    }
  }
  return null
}

/**
 * Valide et prépare l'ajout d'un versement.
 *
 * @param recu Reçu trouvé à partir du numéro saisi, ou `null`.
 */
export function preparerVersement(
  saisie: SaisieVersement,
  recu: Recu | null,
  contexte: ContexteVersement,
): Resultat<ResultatVersement> {
  // R-15 — le numéro doit être saisi avant toute recherche.
  if (!saisie.numeroRecu.trim()) return erreur('numeroRecu', 'numero-recu-obligatoire')

  // R-15 à R-18
  const refus = motifRefusVersement(recu)
  if (refus) return erreurs([refus])

  // `recu` est nécessairement défini ici : `motifRefusVersement` a écarté `null`.
  const recuValide = recu as Recu

  // ---- Erreurs cumulées du formulaire.
  const liste: ErreurValidation[] = []
  if (!saisie.montant.trim()) liste.push({ champ: 'montant', code: 'montant-obligatoire' })
  validerInstrument(saisie.instrument, liste)
  if (liste.length) return erreurs(liste)

  // ---- Contrôles de montant, isolés.

  // R-19
  const montantCentimes = dirhamsSaisisEnCentimes(saisie.montant)
  if (montantCentimes <= 0) return erreur('montant', 'montant-doit-etre-positif')

  const restant = restantDu(recuValide)

  // R-20 — le sixième versement doit solder exactement, ni plus ni moins.
  // Règle explicite et bloquante du fichier de référence, et non une déduction
  // tirée des six lignes du reçu imprimé.
  const estSixiemeVersement = recuValide.versements.length === MAX_VERSEMENTS - 1
  if (estSixiemeVersement && montantCentimes !== restant) {
    return erreur('montant', 'sixieme-versement-doit-solder', {
      restant: montantPourMessage(restant),
    })
  }

  // R-21 — surpaiement interdit.
  if (montantCentimes > restant) {
    return erreur('montant', 'montant-superieur-au-restant', {
      restant: montantPourMessage(restant),
    })
  }

  // R-27, R-28
  const instrument = preparerInstrument(saisie.instrument, contexte)
  if (!instrument) return erreur('operationId', 'operation-partagee-introuvable')

  // R-32
  if (
    instrument.portee === 'shared' &&
    depasseLeRestant(montantCentimes, instrument.disponibleCentimes) &&
    !contexte.depassementConfirme
  ) {
    return {
      statut: 'confirmation-requise',
      motif: 'depassement-operation-partagee',
      montantCentimes,
      disponibleCentimes: instrument.disponibleCentimes,
    }
  }

  // ---- Construction

  const restantApres = Math.max(0, restant - montantCentimes)

  // R-22 — instantané figé sur l'état du reçu au moment du versement.
  const versement: Versement = {
    id: contexte.idVersement,
    rang: recuValide.versements.length + 1,
    montantCentimes,
    nature: saisie.instrument.nature,
    date: contexte.date,
    heure: contexte.heure,
    dateHeure: contexte.horodatage,
    enregistrePar: contexte.employe,
    referenceInstrument: instrument.reference,
    dateInstrument: instrument.dateInstrument,
    banque: instrument.banque,
    portee: instrument.portee,
    operationPartageeId: instrument.operationPartageeId,
    payeur: instrument.payeur,
    montantOperationCentimes: instrument.montantOperationCentimes,
    image: null,
    instantane: {
      client: `${recuValide.prenom} ${recuValide.nom}`,
      hotel: recuValide.hotel,
      chambre: recuValide.chambre,
      vol: recuValide.vol,
      programme: `${recuValide.hotel} / غرفة ${recuValide.chambre} / ${recuValide.vol}`,
      convenuCentimes: recuValide.convenuCentimes,
      rabatteur: recuValide.rabatteur,
      restantApresCentimes: restantApres,
      statutApres: symboleSituation(restantApres),
    },
  }

  return ok({ versement, nouvelleOperation: instrument.nouvelleOperation })
}
