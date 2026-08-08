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
import { formaterTelephone } from '../../domain/format'

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
 * Traduit l'instantané figé stocké sur le paiement (`receipt_payments.
 * payment_snapshot_*`, migration `202608030001`) vers `InstantaneVersement`.
 *
 * Lu tel quel, champ par champ — reprise.md §5.7 exige que cet instantané ne
 * soit jamais recalculé. `statutApres` traduit directement le booléen stocké
 * `settled_after` (lui-même vérifié cohérent avec `remaining_after_dh` par une
 * contrainte en base) : ce n'est pas une nouvelle dérivation depuis le
 * restant, seulement la traduction anglais → symbole exigée par le domaine.
 */
function traduireInstantane(snapshot: BillingReceiptDetail['payments'][number]['snapshot']): Versement['instantane'] {
  return {
    client: snapshot.client_name,
    hotel: snapshot.hotel_name,
    chambre: snapshot.room_label,
    vol: snapshot.flight_label,
    programme: snapshot.program_label,
    convenuCentimes: dhVersCentimes(snapshot.agreed_amount_dh),
    rabatteur: snapshot.rabatteur_name ?? '',
    restantApresCentimes: dhVersCentimes(snapshot.remaining_after_dh),
    statutApres: snapshot.settled_after ? '✓' : '•',
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
    // Prototype (`v.colAmt`) et `instrumentUnique()` du domaine : 0 pour un
    // instrument unique, jamais le montant réel de l'opération sous-jacente.
    // `collecterOperationsBancaires` (cheque-register.ts) reproduit la
    // détection « partagée » exacte du prototype, qui suppose ce contrat —
    // le violer faisait passer tout chèque/virement unique pour « Partagé »
    // dans l'écran Chèques et virements dès que l'opération avait un montant
    // réel non nul (systématique côté omra, chaque paiement ayant sa propre
    // opération). Voir RAPPORT-CHANTIER.md.
    montantOperationCentimes: portee === 'shared' ? dhVersCentimes(operation.operation_amount_dh) : 0,
    // R-38 — l'image d'un versement partagé appartient à l'opération, jamais
    // au versement : ce champ reste `null` dans ce cas.
    image: portee === 'unique' && operation.supporting_image
      ? mapImage(operation.supporting_image)
      : null,
    instantane: traduireInstantane(paiement.snapshot),
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
 *    quels libellés, ce que cette étape ne tranche pas.
 *
 * `versement.instantane` n'est plus une approximation : il est lu tel quel
 * depuis `receipt_payments.payment_snapshot_*` (migration `202608030001`),
 * figé à l'écriture, jamais recalculé — voir `traduireInstantane`.
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
    // Stocké en 10 chiffres bruts (voir `create-receipt.ts`/`edit-sections.ts`) ;
    // `formaterTelephone` est idempotente sur une valeur déjà mise en forme,
    // donc sûre même sur une ligne antérieure à la migration de normalisation.
    telephone: formaterTelephone(detail.registration.phone_snapshot ?? ''),
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
      .map((paiement) => mapVersement(detail, paiement)),
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
