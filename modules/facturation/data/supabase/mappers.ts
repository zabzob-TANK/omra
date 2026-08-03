/**
 * Construction d'entités du domaine à partir des lignes brutes renvoyées par
 * les RPC Supabase.
 *
 * Fonctions pures : aucun appel réseau ici, uniquement de la traduction de
 * forme. Les appels RPC eux-mêmes vivent dans `read.ts`.
 */

import type {
  BillingOperation,
  BillingReceiptDetail,
  ReusablePaymentOperation,
} from '@/lib/facturation/types'
import { symboleSituation } from '../../domain/rules/receipt'
import type {
  OperationPartagee,
  PorteeVersement,
  Recu,
  ReferenceFichier,
  Versement,
} from '../../domain/types'
import {
  modeRemboursementDepuisRoute,
  natureDepuisModePaiement,
  statutDepuisLifecycle,
} from './codes'
import { dateSqlVersDateFr, isoVersDateFr, isoVersHeure, isoVersHorodatage } from './dates'
import { dhVersCentimes } from './dh'

function porteeDepuisUsageKind(usageKind: string): PorteeVersement {
  if (usageKind === 'unique' || usageKind === 'shared') return usageKind
  throw new Error(`Portée de versement inconnue reçue de la base : ${JSON.stringify(usageKind)}`)
}

function mapImage(
  image: NonNullable<BillingOperation['supporting_image']>,
): ReferenceFichier {
  return {
    // Convention adoptée ici : le chemin combine le bucket et le chemin de
    // stockage, séparés par `/`. `StockageFichiersPort` (étape écriture) devra
    // respecter la même convention pour que `url()` puisse les séparer.
    chemin: `${image.storage_bucket}/${image.storage_path}`,
    nomOrigine: image.original_file_name,
    origine: 'upload',
    deposeLe: isoVersHorodatage(image.uploaded_at),
    deposePar: image.uploaded_by.slot_label,
  }
}

function trouverOperation(
  detail: BillingReceiptDetail,
  operationId: string | null,
): BillingOperation | null {
  if (!operationId) return null
  return detail.operations.find((operation) => operation.id === operationId) ?? null
}

/**
 * Reconstruction **approximative** de l'instantané d'un versement.
 *
 * ⚠️ Ce n'est PAS l'instantané figé exigé par reprise.md §5.7. Le schéma
 * `omra` ne stocke aujourd'hui aucune colonne d'instantané par versement
 * (hôtel/chambre/vol/convenu/restant/statut au moment du paiement) — seul le
 * niveau inscription (`traveler_registrations`) porte des `*_snapshot`, figés
 * une fois à l'inscription, jamais par versement.
 *
 * Cette fonction recalcule `restantApresCentimes` et `statutApres` à partir
 * du montant convenu **actuel** et de la somme des versements dont le rang
 * est inférieur ou égal à celui-ci. Cette valeur est correcte tant qu'aucune
 * correction commerciale n'a changé le montant convenu depuis ce versement ;
 * elle devient silencieusement fausse pour les versements antérieurs à une
 * telle correction, puisque le montant convenu au moment du versement n'est
 * conservé nulle part.
 *
 * Les autres champs (client, hôtel, chambre, vol, programme, rabatteur)
 * proviennent des `*_snapshot` de l'inscription : ceux-là sont réellement
 * figés et donc fiables, contrairement à `convenuCentimes`.
 *
 * Une vraie correction exige une migration ajoutant des colonnes
 * d'instantané à `receipt_payments`, renseignées à l'écriture — hors
 * périmètre de cette étape de lecture.
 */
function construireInstantaneApproximatif(
  detail: BillingReceiptDetail,
  rangVersement: number,
  convenuCentimesActuel: number,
): Versement['instantane'] {
  const cumulJusquauRang = detail.payments
    .filter((paiement) => paiement.payment_number <= rangVersement)
    .reduce((somme, paiement) => somme + dhVersCentimes(paiement.amount_dh), 0)
  const restantApresCentimes = Math.max(0, convenuCentimesActuel - cumulJusquauRang)

  const hotel = detail.registration.hotel_name_snapshot
  const chambre = detail.registration.room_label_snapshot
  const vol = detail.registration.flight_label_snapshot

  return {
    client: `${detail.registration.first_name_snapshot} ${detail.registration.last_name_snapshot}`,
    hotel,
    chambre,
    vol,
    programme: `${hotel} / غرفة ${chambre} / ${vol}`,
    convenuCentimes: convenuCentimesActuel,
    rabatteur: detail.registration.rabatteur_name_snapshot ?? '',
    restantApresCentimes,
    statutApres: symboleSituation(restantApresCentimes),
  }
}

/**
 * Construit un `Versement` du domaine à partir d'un paiement et de
 * l'opération qui lui est allouée.
 *
 * Lève une erreur si le paiement n'a pas d'opération associée : le schéma
 * attend exactement une allocation par paiement (`consistency.
 * payments_without_exactly_one_allocation`), et une absence à ce stade est un
 * défaut d'intégrité à signaler, jamais à contourner silencieusement.
 */
function mapVersement(
  detail: BillingReceiptDetail,
  paiement: BillingReceiptDetail['payments'][number],
  convenuCentimesActuel: number,
): Versement {
  const operation = trouverOperation(detail, paiement.payment_operation_id)
  if (!operation) {
    throw new Error(
      `Paiement ${paiement.id} du reçu ${detail.receipt.id} sans opération associée : ` +
        'intégrité rompue (allocation manquante ou orpheline).',
    )
  }

  const portee = porteeDepuisUsageKind(paiement.usage_kind)
  const instrument = operation.instrument

  return {
    id: paiement.id,
    rang: paiement.payment_number,
    montantCentimes: dhVersCentimes(paiement.amount_dh),
    nature: natureDepuisModePaiement(paiement.payment_mode),
    date: isoVersDateFr(paiement.registered_at),
    heure: isoVersHeure(paiement.registered_at),
    dateHeure: isoVersHorodatage(paiement.registered_at),
    enregistrePar: paiement.created_by.slot_label,
    referenceInstrument: instrument?.reference ?? '',
    dateInstrument: instrument ? dateSqlVersDateFr(instrument.instrument_date) : '',
    banque: instrument?.bank_name ?? '',
    portee,
    operationPartageeId: portee === 'shared' ? operation.id : '',
    payeur: instrument?.payer_name ?? '',
    montantOperationCentimes: dhVersCentimes(operation.operation_amount_dh),
    // R-38 — l'image d'un versement partagé appartient à l'opération, jamais
    // au versement : ce champ reste `null` dans ce cas.
    image: portee === 'unique' && operation.supporting_image
      ? mapImage(operation.supporting_image)
      : null,
    instantane: construireInstantaneApproximatif(detail, paiement.payment_number, convenuCentimesActuel),
  }
}

/**
 * Construit un `Recu` complet à partir de `get_billing_receipt_details`.
 *
 * Champs volontairement incomplets ou approximatifs — voir le rapport de
 * portage plutôt que de deviner en silence :
 *  - `groupe` est renseigné depuis `dossier.label`, en attendant une décision
 *    sur la correspondance entre `omra_dossiers` et le tag groupe/famille du
 *    prototype (reprise.md §5.4, CLAUDE.md) ;
 *  - `impressions` vaut toujours 0 : aucune des quatre RPC de cette étape ne
 *    renvoie l'historique d'impression (`get_billing_receipt_print_summary`
 *    est hors périmètre) ;
 *  - `modifications` est toujours vide : la forme stockée (`before_data`/
 *    `after_data` en JSON libre dans `history`) ne correspond pas à
 *    `ChangementChamp[]` (avant/après par champ nommé) attendu par le
 *    domaine — la traduire exige de décider quels champs diffuser et sous
 *    quels libellés, ce que cette étape ne tranche pas ;
 *  - chaque `versement.instantane` est une reconstruction approximative, voir
 *    `construireInstantaneApproximatif`.
 */
export function mapReceiptDetailToRecu(detail: BillingReceiptDetail): Recu {
  const convenuCentimes = dhVersCentimes(detail.registration.agreed_amount_dh)
  const cancellation = detail.receipt.cancellation
  const dernierChangement = detail.modifications.last

  return {
    id: detail.receipt.id,
    numero: detail.receipt.receipt_number,
    clientId: detail.registration.traveler_id,
    // Le passeport n'est pas modélisé dans le noyau omra (CLAUDE.md §8).
    passeport: null,
    prenom: detail.registration.first_name_snapshot,
    nom: detail.registration.last_name_snapshot,
    telephone: detail.registration.phone_snapshot ?? '',
    hotel: detail.registration.hotel_name_snapshot,
    vol: detail.registration.flight_label_snapshot,
    chambre: detail.registration.room_label_snapshot,
    tarifCentimes: dhVersCentimes(detail.registration.catalog_price_dh),
    reductionCentimes: dhVersCentimes(detail.registration.discount_amount_dh),
    convenuCentimes,
    rabatteur: detail.registration.rabatteur_name_snapshot ?? '',
    // Provisoire — voir le commentaire de fonction.
    groupe: detail.registration.dossier.label ?? '',
    note: detail.registration.note ?? '',
    date: isoVersDateFr(detail.receipt.created_at),
    creeLe: isoVersHorodatage(detail.receipt.created_at),
    employe: detail.receipt.created_by.slot_label,
    statut: statutDepuisLifecycle(detail.receipt.lifecycle_status),
    motifAnnulation: cancellation?.reason ?? '',
    annulePar: cancellation?.cancelled_by.slot_label ?? undefined,
    annuleLe: cancellation ? isoVersHorodatage(cancellation.cancelled_at) : undefined,
    modeRemboursement: cancellation
      ? modeRemboursementDepuisRoute(cancellation.restitution_route)
      : undefined,
    // ⚠️ Lu tel quel depuis `total_cancelled_dh`. Tant que la migration de
    // correction de fusion.md §4.1/§6 (étape 6) n'est pas appliquée, cette
    // valeur peut ne pas être plafonnée à `min(total payé, convenu)` — voir
    // le rapport de portage.
    montantRembourseCentimes: cancellation
      ? dhVersCentimes(cancellation.total_cancelled_dh)
      : undefined,
    // Non disponible via ces 4 RPC — voir le commentaire de fonction.
    impressions: 0,
    // Non disponible via ces 4 RPC sous la forme attendue — voir le commentaire de fonction.
    modifications: [],
    derniereModification: dernierChangement ? isoVersHorodatage(dernierChangement.occurred_at) : undefined,
    modifiePar: dernierChangement
      ? dernierChangement.actor_login ?? dernierChangement.actor_slot_label
      : undefined,
    versements: detail.payments
      .slice()
      .sort((a, b) => a.payment_number - b.payment_number)
      .map((paiement) => mapVersement(detail, paiement, convenuCentimes)),
  }
}

/**
 * Construit une `OperationPartagee` à partir d'une ligne de
 * `list_reusable_payment_operations`.
 *
 * Champs non disponibles depuis cette RPC, donc approximés :
 *  - `creeePar` reste vide : la RPC ne renvoie aucune identité de créateur ;
 *  - `statut` vaut toujours `'active'` : le schéma `omra` n'expose aucune
 *    notion d'archivage (R-31) sur `payment_operations` ;
 *  - `image` reste `null` : la RPC ne renvoie qu'un booléen
 *    (`has_active_supporting_image`), jamais la référence complète — celle-ci
 *    n'est disponible que via `get_billing_receipt_details` d'un reçu qui
 *    utilise cette opération.
 */
export function mapReusableOperationToOperationPartagee(
  row: ReusablePaymentOperation,
): OperationPartagee {
  return {
    id: row.payment_operation_id,
    nature: natureDepuisModePaiement(row.payment_mode),
    reference: row.instrument_reference,
    dateInstrument: dateSqlVersDateFr(row.instrument_date),
    banque: row.bank_name,
    payeur: row.payer_name,
    montantTotalCentimes: dhVersCentimes(row.operation_amount_dh),
    creeeLe: isoVersHorodatage(row.registered_at),
    creeePar: '',
    statut: 'active',
    image: null,
  }
}
