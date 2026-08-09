/**
 * Construction d'entités du domaine à partir des lignes brutes renvoyées par
 * les RPC Supabase.
 *
 * Fonctions pures : aucun appel réseau ici, uniquement de la traduction de
 * forme. Les appels RPC eux-mêmes vivent dans `read.ts`.
 */

import type {
  BillingOperation,
  BillingOperationsJournalRow,
  BillingReceiptDetail,
  BillingReceiptHistoryRow,
  BillingReceiptRow,
  BillingSeasonModificationRow,
  BillingSeasonPaymentRow,
  ReusablePaymentOperation,
} from '@/lib/facturation/types'
import type {
  AnomalieFinanciere,
  ChangementChamp,
  EvenementModificationSaison,
  LigneJournalOperations,
  Modification,
  OperationPartagee,
  PorteeVersement,
  Recu,
  RecuSaison,
  ReferenceFichier,
  TypeAnomalie,
  Versement,
  VersementSaison,
} from '../../domain/types'
import {
  modeRemboursementDepuisRoute,
  natureDepuisModePaiement,
  statutDepuisLifecycle,
} from './codes'
import { dateSqlVersDateFr, isoVersDateFr, isoVersHeure, isoVersHorodatage } from './dates'
import { dhVersCentimes } from './dh'
import { formaterTelephone } from '../../domain/format'
import { LIBELLES_SECTIONS } from '../../domain/rules/edit-sections'
import {
  changementsHistorique,
  sectionDepuisActionType,
  type InstantaneHistorique,
} from '../../domain/rules/modification-history'
import { libelleActionJournal } from '../../domain/rules/operations-journal'

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
 * Construit un `VersementSaison` depuis une ligne de
 * `list_billing_season_payments` — jamais depuis un `Recu` complet.
 *
 * Reproduit exactement le contrat de `mapVersement` pour les champs communs,
 * sans `instantane` (non lu par les écrans consommateurs, voir
 * `VersementSaison`). Pour un versement unique, l'image vient du
 * justificatif actif de sa propre opération (mêmes colonnes que
 * `mapImage`, portées à plat par la RPC) ; pour un versement partagé, elle
 * reste `null` ici — `collecterOperationsBancaires` la lit depuis
 * `operations`, chargé séparément et inchangé par ce lot.
 */
export function mapSeasonPaymentRowToVersementSaison(ligne: BillingSeasonPaymentRow): VersementSaison {
  const portee = porteeDepuisUsageKind(ligne.usage_kind)
  return {
    versement: {
      id: ligne.payment_id,
      rang: ligne.payment_number,
      montantCentimes: dhVersCentimes(ligne.amount_dh),
      nature: natureDepuisModePaiement(ligne.payment_mode),
      date: isoVersDateFr(ligne.payment_registered_at),
      heure: isoVersHeure(ligne.payment_registered_at),
      dateHeure: isoVersHorodatage(ligne.payment_registered_at),
      enregistrePar: ligne.payment_created_by_slot_label,
      referenceInstrument: ligne.instrument_reference ?? '',
      dateInstrument: ligne.instrument_date ? dateSqlVersDateFr(ligne.instrument_date) : '',
      banque: ligne.bank_name ?? '',
      portee,
      operationPartageeId: portee === 'shared' ? ligne.operation_id : '',
      payeur: ligne.payer_name ?? '',
      montantOperationCentimes: portee === 'shared' ? dhVersCentimes(ligne.operation_amount_dh) : 0,
      image:
        portee === 'unique' && ligne.image_storage_path
          ? {
              chemin: `${ligne.image_storage_bucket}/${ligne.image_storage_path}`,
              nomOrigine: ligne.image_original_file_name ?? '',
              origine: 'upload',
              deposeLe: ligne.image_uploaded_at ? isoVersHorodatage(ligne.image_uploaded_at) : '',
              deposePar: ligne.image_uploaded_by_slot_label ?? undefined,
            }
          : null,
      // R-14, R-22 — instantané figé, jamais recalculé depuis l'état actuel.
      instantane: {
        client: ligne.snapshot_client_name,
        hotel: ligne.snapshot_hotel_name,
        chambre: ligne.snapshot_room_label,
        vol: ligne.snapshot_flight_label,
        programme: ligne.snapshot_program_label,
        convenuCentimes: dhVersCentimes(ligne.snapshot_agreed_amount_dh),
        rabatteur: ligne.snapshot_rabatteur_name ?? '',
        restantApresCentimes: dhVersCentimes(ligne.snapshot_remaining_after_dh),
        statutApres: ligne.snapshot_settled_after ? '✓' : '•',
      },
    },
    operationEnregistreeLe: isoVersHorodatage(ligne.operation_registered_at),
    recu: {
      id: ligne.receipt_id,
      numero: ligne.receipt_number,
      prenom: ligne.traveler_first_name_snapshot,
      nom: ligne.traveler_last_name_snapshot,
      statut: statutDepuisLifecycle(ligne.lifecycle_status),
      employe: ligne.receipt_created_by_slot_label,
      hotel: ligne.registration_hotel_name,
      chambre: ligne.registration_room_label,
      vol: ligne.registration_flight_label,
      rabatteur: ligne.registration_rabatteur_name ?? '',
      convenuCentimes: dhVersCentimes(ligne.registration_agreed_amount_dh),
    },
  }
}

/**
 * Construit un `RecuSaison` depuis une ligne de `list_billing_receipts` —
 * pour le Suivi journalier et le Journal financier, jamais depuis un `Recu`
 * complet. `totalPayeCentimes` reprend l'agrégat déjà calculé côté RPC
 * (`total_paid_dh`), jamais resommé depuis des versements non chargés ici.
 */
export function mapReceiptRowToRecuSaison(ligne: BillingReceiptRow): RecuSaison {
  return {
    id: ligne.receipt_id,
    numero: ligne.receipt_number,
    date: isoVersDateFr(ligne.receipt_created_at),
    statut: statutDepuisLifecycle(ligne.lifecycle_status),
    annuleLe: ligne.cancelled_at ? isoVersHorodatage(ligne.cancelled_at) : undefined,
    totalPayeCentimes: dhVersCentimes(ligne.total_paid_dh),
  }
}

function texteOptionnel(valeur: unknown): string | undefined {
  return typeof valeur === 'string' ? valeur : undefined
}

function nombreOptionnel(valeur: unknown): number | undefined {
  return typeof valeur === 'number' ? valeur : undefined
}

/**
 * Reconstruit l'instantané avant/après d'un événement d'historique depuis le
 * JSON brut de `before_data`/`after_data` (`facturation_action_history`),
 * selon la forme propre à chaque type d'action (2026-08-09) — voir
 * `modification-history.ts` pour la correspondance vers `ChangementChamp[]`.
 * La date d'instrument est convertie ici (SQL → jj/mm/aaaa) : c'est la seule
 * conversion propre à cette couche, `changementsHistorique` reste pur.
 */
function instantaneHistoriqueDepuisJson(
  actionType: string,
  donnees: Record<string, unknown> | null,
): InstantaneHistorique {
  if (!donnees) return {}

  if (
    actionType === 'billing_receipt.first_payment_method_corrected' ||
    actionType === 'billing_receipt.payment_method_corrected'
  ) {
    const instrument =
      donnees.instrument && typeof donnees.instrument === 'object'
        ? (donnees.instrument as Record<string, unknown>)
        : null
    const dateInstrumentSql = instrument ? texteOptionnel(instrument.instrument_date) : undefined
    return {
      montantDh: nombreOptionnel(donnees.payment_amount_dh),
      nature: texteOptionnel(donnees.payment_mode),
      reference: instrument ? texteOptionnel(instrument.reference) : undefined,
      banque: instrument ? texteOptionnel(instrument.bank_name) : undefined,
      dateInstrument: dateInstrumentSql ? dateSqlVersDateFr(dateInstrumentSql) : undefined,
      payeur: instrument ? texteOptionnel(instrument.payer_name) : undefined,
    }
  }

  return {
    prenom: texteOptionnel(donnees.first_name),
    nom: texteOptionnel(donnees.last_name),
    telephone: texteOptionnel(donnees.phone),
    note: texteOptionnel(donnees.note),
    hotel: texteOptionnel(donnees.hotel_name_snapshot),
    vol: texteOptionnel(donnees.flight_label_snapshot),
    chambre: texteOptionnel(donnees.room_label_snapshot),
    tarifDh: nombreOptionnel(donnees.catalog_price_dh),
    reductionDh: nombreOptionnel(donnees.discount_amount_dh),
    convenuDh: nombreOptionnel(donnees.agreed_amount_dh),
  }
}

/**
 * Construit un `EvenementModificationSaison` depuis une ligne de
 * `list_billing_season_modifications`. Le détail champ par champ
 * (`changements`) est ajouté le 2026-08-09 (202608090012) : jusque-là cette
 * RPC n'exposait pas `before_data`/`after_data`.
 */
export function mapModificationRowToEvenementSaison(
  ligne: BillingSeasonModificationRow,
): EvenementModificationSaison {
  const section = sectionDepuisActionType(ligne.action_type)
  return {
    id: ligne.modification_id,
    recuNumero: ligne.receipt_number,
    prenom: ligne.traveler_first_name_snapshot,
    nom: ligne.traveler_last_name_snapshot,
    sectionLibelle: LIBELLES_SECTIONS[section],
    changements: changementsHistorique(
      ligne.action_type,
      instantaneHistoriqueDepuisJson(ligne.action_type, ligne.before_data),
      instantaneHistoriqueDepuisJson(ligne.action_type, ligne.after_data),
    ),
    motif: ligne.reason || '—',
    employe: ligne.actor_slot_label,
    survenuLe: isoVersHorodatage(ligne.occurred_at),
  }
}

/**
 * Câblage ajouté le 2026-08-09 : `list_billing_receipt_history` donne enfin
 * accès au détail (date, auteur, motif) des modifications d'UN reçu — le
 * compteur (`Recu.nombreModifications`) existait déjà, jamais cette liste.
 *
 * `changements` — vide jusqu'au 202608090012, qui ajoute `before_data`/
 * `after_data` à cette RPC. Reconstruit désormais via `changementsHistorique`,
 * la même correspondance que le tableau des modifications du Journal
 * financier (`mapModificationRowToEvenementSaison`) — jamais dupliquée.
 */
export function mapReceiptHistoryToModifications(
  lignes: readonly BillingReceiptHistoryRow[],
): Modification[] {
  return lignes.map((ligne) => {
    const section = sectionDepuisActionType(ligne.action_type)
    return {
      id: ligne.history_id,
      section,
      sectionLibelle: LIBELLES_SECTIONS[section],
      changements: changementsHistorique(
        ligne.action_type,
        instantaneHistoriqueDepuisJson(ligne.action_type, ligne.before_data),
        instantaneHistoriqueDepuisJson(ligne.action_type, ligne.after_data),
      ),
      motif: ligne.reason || '—',
      employe: ligne.actor_slot_label,
      dateHeure: isoVersHorodatage(ligne.occurred_at),
    }
  })
}

/**
 * Construit une `LigneJournalOperations` depuis `list_billing_operations_journal`
 * (202608090013) — description complète du commanditaire (2026-08-09).
 * `changementsHistorique` renvoie `[]` pour tout type d'action absent de son
 * `switch` (création, versement, annulation, impression…) : pas de branche
 * séparée ici, le même appel sert les sept types de modification et les huit
 * autres, exactement comme pour `mapReceiptHistoryToModifications`.
 */
export function mapOperationsJournalRowToLigne(
  ligne: BillingOperationsJournalRow,
): LigneJournalOperations {
  return {
    id: ligne.id,
    heure: isoVersHeure(ligne.occurred_at),
    date: isoVersDateFr(ligne.occurred_at),
    nature: libelleActionJournal(ligne.action_type),
    typeAction: ligne.action_type,
    numeroRecu: ligne.receipt_number ?? undefined,
    client:
      ligne.traveler_first_name_snapshot && ligne.traveler_last_name_snapshot
        ? `${ligne.traveler_first_name_snapshot} ${ligne.traveler_last_name_snapshot}`
        : undefined,
    changements: changementsHistorique(
      ligne.action_type,
      instantaneHistoriqueDepuisJson(ligne.action_type, ligne.before_data),
      instantaneHistoriqueDepuisJson(ligne.action_type, ligne.after_data),
    ),
    motif: ligne.reason ?? undefined,
    employe: ligne.actor_slot_label,
    employeSlot: ligne.actor_slot_number,
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
 *  - `impressions` vient de `get_billing_receipt_print_summary` (migration
 *    `202608040001`), passé en second paramètre — cette RPC est distincte de
 *    `get_billing_receipt_details` et doit être appelée séparément par
 *    l'appelant (voir `chargerRecuParId`, `read.ts`). `null` signifie que
 *    cette lecture a échoué, jamais « jamais imprimé » — ce mapper ne fait
 *    que reporter tel quel ce que l'appelant lui donne, jamais un 0 par
 *    défaut ;
 *  - `modifications` est toujours vide : la forme stockée (`before_data`/
 *    `after_data` en JSON libre dans `history`) ne correspond pas à
 *    `ChangementChamp[]` (avant/après par champ nommé) attendu par le
 *    domaine — la traduire exige de décider quels champs diffuser et sous
 *    quels libellés, ce que cette étape ne tranche pas. `nombreModifications`
 *    porte quand même le vrai compte (`detail.modifications.count`), qui ne
 *    dépend pas de cette traduction.
 *
 * `versement.instantane` n'est plus une approximation : il est lu tel quel
 * depuis `receipt_payments.payment_snapshot_*` (migration `202608030001`),
 * figé à l'écriture, jamais recalculé — voir `traduireInstantane`.
 *
 * `anomalies` traduit `detail.active_anomalies` (voir `traduireAnomalies`) —
 * décision du 2026-08-08 : le statut affiché (`statutAffiche`) ne porte plus
 * seul la visibilité du trop-perçu, ce tableau la porte de façon indépendante.
 */
/** Traduit `type` brut de `active_anomalies` vers la nomenclature du domaine — jamais fusionnés. */
function typeAnomalieDepuisBrut(type: BillingReceiptDetail['active_anomalies'][number]['type']): TypeAnomalie {
  if (type === 'overpayment') return 'trop-percu'
  if (type === 'amount_due') return 'reste-a-payer'
  return 'justificatif-cheque-manquant'
}

/**
 * Traduit `get_billing_receipt_details.active_anomalies`, déjà calculé côté
 * serveur (jamais recalculé ici) — voir `AnomalieFinanciere` dans
 * `domain/types.ts` pour l'origine exacte de chaque type.
 */
function traduireAnomalies(detail: BillingReceiptDetail): AnomalieFinanciere[] {
  return detail.active_anomalies.map((anomalie) => ({
    type: typeAnomalieDepuisBrut(anomalie.type),
    montantCentimes: anomalie.amount_dh === null ? null : dhVersCentimes(anomalie.amount_dh),
    operationId: anomalie.operation_id ?? undefined,
    dernierChangement: isoVersHorodatage(anomalie.last_changed_at),
  }))
}

export function mapReceiptDetailToRecu(detail: BillingReceiptDetail, impressions: number | null): Recu {
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
    impressions,
    // Non disponible via ces 4 RPC sous la forme attendue — voir le commentaire de fonction.
    modifications: [],
    nombreModifications: detail.modifications.count,
    derniereModification: dernierChangement ? isoVersHorodatage(dernierChangement.occurred_at) : undefined,
    modifiePar: dernierChangement
      ? dernierChangement.actor_login ?? dernierChangement.actor_slot_label
      : undefined,
    versements: detail.payments
      .slice()
      .sort((a, b) => a.payment_number - b.payment_number)
      .map((paiement) => mapVersement(detail, paiement)),
    anomalies: traduireAnomalies(detail),
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
