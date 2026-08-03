/**
 * Création d'un reçu.
 *
 * Couvre : R-01 à R-14.
 *
 * L'ordre des contrôles reproduit exactement `saveNew()` du fichier de
 * référence, y compris la distinction entre les erreurs **cumulées** de la
 * première passe et les erreurs **isolées** de la seconde, qui interrompent
 * immédiatement le traitement.
 */

import { MAX_VERSEMENTS, STATUT_ACTIF } from '../constants'
import { chiffresTelephone } from '../format'
import { dirhamsSaisisEnCentimes } from '../money'
import type { OperationPartagee, Passeport, Tarif, Versement } from '../types'
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
import { symboleSituation } from './receipt'
import { depasseLeRestant } from './shared-payment'
import { construireGrille, montantConvenu, reductionAtteintLeTarif, reductionDepasseLePlafond } from './tarif'

export interface SaisieNouveauRecu {
  prenom: string
  nom: string
  telephone: string
  hotel: string
  vol: string
  chambre: string
  rabatteur: string
  /** Réduction saisie en dirhams. */
  reduction: string
  groupeCoche: boolean
  groupe: string
  /** Premier versement saisi en dirhams. */
  premierVersement: string
  note: string
  instrument: SaisieInstrument
  passeport: Passeport | null
}

/** Données prêtes à être persistées. Correspond à `RecusPort.creer`. */
export interface DonneesCreationRecu {
  numero: number
  clientId: string
  prenom: string
  nom: string
  telephone: string
  hotel: string
  vol: string
  chambre: string
  tarifCentimes: number
  reductionCentimes: number
  convenuCentimes: number
  rabatteur: string
  groupe: string
  note: string
  passeport: Passeport | null
  employe: string
  premierVersement: Versement
}

export interface ResultatCreation {
  donnees: DonneesCreationRecu
  /** Opération partagée à enregistrer avant le reçu, ou `null`. */
  nouvelleOperation: OperationPartagee | null
}

export interface ContexteCreation extends ContextePreparation {
  /** Tarifs de la saison active. */
  tarifs: readonly Tarif[]
  /** R-06 — Plafond de réduction de la saison, en centimes. */
  reductionMaxCentimes: number
  /** R-11 — Numéro réservé sur la séquence. */
  numero: number
  clientId: string
  /** Identifiant du versement à créer. */
  idVersement: string
  /** Date du jour, `jj/mm/aaaa`. */
  date: string
  /** Heure `HH:MM`. */
  heure: string
  /**
   * R-32 — Confirmation explicite d'un dépassement d'opération partagée.
   * Faux par défaut : le dépassement interrompt et demande confirmation.
   */
  depassementConfirme?: boolean
}

/**
 * Valide et prépare la création d'un reçu.
 *
 * @returns `ok` avec les données à persister, `erreurs` avec la liste ordonnée,
 *   ou `confirmation-requise` lorsqu'une part dépasse le restant d'une
 *   opération partagée (R-32).
 */
export function preparerCreationRecu(
  saisie: SaisieNouveauRecu,
  contexte: ContexteCreation,
): Resultat<ResultatCreation> {
  // ---- Première passe : erreurs cumulées, dans l'ordre du fichier de référence.
  const liste: ErreurValidation[] = []

  // R-01
  if (!saisie.prenom.trim()) liste.push({ champ: 'prenom', code: 'prenom-obligatoire' })
  if (!saisie.nom.trim()) liste.push({ champ: 'nom', code: 'nom-obligatoire' })

  // R-01, R-02
  if (!saisie.telephone.trim()) {
    liste.push({ champ: 'telephone', code: 'telephone-obligatoire' })
  } else if (chiffresTelephone(saisie.telephone) !== 10) {
    liste.push({ champ: 'telephone', code: 'telephone-dix-chiffres' })
  }

  // R-03 — l'ordre est celui du fichier de référence : le rabatteur vient
  // après le premier versement.
  if (!saisie.hotel) liste.push({ champ: 'hotel', code: 'hotel-obligatoire' })
  if (!saisie.vol) liste.push({ champ: 'vol', code: 'vol-obligatoire' })
  if (!saisie.chambre) liste.push({ champ: 'chambre', code: 'chambre-obligatoire' })
  if (!saisie.premierVersement.trim()) {
    liste.push({ champ: 'premierVersement', code: 'premier-versement-obligatoire' })
  }
  if (!saisie.rabatteur) liste.push({ champ: 'rabatteur', code: 'rabatteur-obligatoire' })

  // R-23 à R-26
  validerInstrument(saisie.instrument, liste)

  // R-04
  if (saisie.groupeCoche && !saisie.groupe.trim()) {
    liste.push({ champ: 'groupe', code: 'groupe-obligatoire' })
  }

  if (liste.length) return erreurs(liste)

  // ---- Seconde passe : erreurs isolées, chacune interrompt immédiatement.

  // R-05
  const grille = construireGrille(contexte.tarifs)
  const tarifCentimes = grille.tarifPour(saisie.hotel, saisie.vol, saisie.chambre)
  if (tarifCentimes === null) return erreur('hotel', 'tarif-introuvable')

  // R-06
  const reductionCentimes = dirhamsSaisisEnCentimes(saisie.reduction)
  if (reductionDepasseLePlafond(reductionCentimes, contexte.reductionMaxCentimes)) {
    return erreur('reduction', 'reduction-superieure-au-plafond', {
      plafond: montantPourMessage(contexte.reductionMaxCentimes),
    })
  }

  // R-07
  if (reductionAtteintLeTarif(reductionCentimes, tarifCentimes)) {
    return erreur('reduction', 'reduction-superieure-ou-egale-au-tarif')
  }

  // R-08
  const convenuCentimes = montantConvenu(tarifCentimes, reductionCentimes)

  // R-09
  const montantVersement = dirhamsSaisisEnCentimes(saisie.premierVersement)
  if (montantVersement <= 0) {
    return erreur('premierVersement', 'montant-doit-etre-positif')
  }

  // R-10 — surpaiement interdit dès la création.
  if (montantVersement > convenuCentimes) {
    return erreur('premierVersement', 'montant-superieur-au-convenu', {
      convenu: montantPourMessage(convenuCentimes),
    })
  }

  // R-27, R-28
  const instrument = preparerInstrument(saisie.instrument, contexte)
  if (!instrument) return erreur('operationId', 'operation-partagee-introuvable')

  // R-32
  if (
    instrument.portee === 'shared' &&
    depasseLeRestant(montantVersement, instrument.disponibleCentimes) &&
    !contexte.depassementConfirme
  ) {
    return {
      statut: 'confirmation-requise',
      motif: 'depassement-operation-partagee',
      montantCentimes: montantVersement,
      disponibleCentimes: instrument.disponibleCentimes,
    }
  }

  // ---- Construction

  const restantApres = Math.max(0, convenuCentimes - montantVersement)
  const prenom = saisie.prenom.trim()
  const nom = saisie.nom.trim()

  // R-14 — instantané figé, jamais réécrit par une modification ultérieure.
  const versement: Versement = {
    id: contexte.idVersement,
    rang: 1,
    montantCentimes: montantVersement,
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
      client: `${prenom} ${nom}`,
      hotel: saisie.hotel,
      chambre: saisie.chambre,
      vol: saisie.vol,
      programme: `${saisie.hotel} / غرفة ${saisie.chambre} / ${saisie.vol}`,
      convenuCentimes,
      rabatteur: saisie.rabatteur,
      restantApresCentimes: restantApres,
      // Le fichier de référence teste `conv - pay === 0`, sans écrêtage.
      statutApres: symboleSituation(convenuCentimes - montantVersement),
    },
  }

  return ok({
    donnees: {
      numero: contexte.numero,
      // R-13 — le client est rattaché au reçu, et le passeport scanné le suit
      // s'il a été saisi. Les deux sont transmis tels quels à la persistance.
      clientId: contexte.clientId,
      prenom,
      nom,
      telephone: saisie.telephone,
      hotel: saisie.hotel,
      vol: saisie.vol,
      chambre: saisie.chambre,
      tarifCentimes,
      reductionCentimes,
      convenuCentimes,
      rabatteur: saisie.rabatteur,
      // R-04 — le code n'est conservé que si la case est cochée.
      groupe: saisie.groupeCoche ? saisie.groupe.trim() : '',
      note: saisie.note,
      passeport: saisie.passeport,
      employe: contexte.employe,
      premierVersement: versement,
    },
    nouvelleOperation: instrument.nouvelleOperation,
  })
}

/** R-12 — Valeurs initiales d'un reçu nouvellement créé. */
export const VALEURS_INITIALES_RECU = {
  statut: STATUT_ACTIF,
  impressions: 0,
  modifications: [] as const,
  motifAnnulation: '',
} as const

/** R-18 — Rappel du plafond, exposé pour l'interface. */
export const MAXIMUM_VERSEMENTS = MAX_VERSEMENTS
