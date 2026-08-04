import 'server-only'

/**
 * Écriture réelle vers Supabase : appelle les RPC existantes qui créent ou
 * modifient des données.
 *
 * Comme `read.ts`, jamais de `service_role` ici : `createClient()` exécute
 * chaque RPC sous la session de l'utilisateur connecté (rôle `authenticated`),
 * et c'est `resolve_facturation_actor()` côté SQL qui détermine l'identité —
 * jamais une valeur fournie par ce code (règle absolue n°4 de l'étape 5).
 *
 * Trois réconciliations d'architecture, documentées une fois ici plutôt qu'à
 * chaque fonction :
 *
 *  1. **Client et opération partagée ne se créent jamais séparément.**
 *     `service.ts` appelle `clients.creer()` et `operationsPartagees.creer()`
 *     avant `recus.creer()`/`ajouterVersement()` (deux dépôts distincts dans
 *     le prototype). omra crée voyageur + inscription + reçu + versement +
 *     opération de paiement **atomiquement**, dans une seule RPC. `clients.*`
 *     et `operationsPartagees.creer()` sont donc des no-op : tout le travail a
 *     lieu ici, dans `RecusPort.creer`/`ajouterVersement`, qui reconnaissent
 *     une opération « nouvelle » à son identifiant provisoire (`ids.ts`,
 *     `estIdentifiantReel`) plutôt qu'à un objet transmis séparément.
 *
 *  2. **Le nom EST l'identifiant.** Le domaine ne connaît aucun UUID interne
 *     pour hôtel/vol/chambre/rabatteur (`create-receipt.ts` copie
 *     `saisie.hotel` verbatim). `programme.ts` résout ces noms vers les
 *     véritables UUID `omra_program_*.id` qu'exigent les RPC.
 *
 *  3. **Groupe/dossier, correction du premier versement, impressions et
 *     passeport restent indisponibles**, chacun pour une raison déjà
 *     documentée dans `fusion.md`/`reprise.md` — voir les fonctions
 *     correspondantes ci-dessous, qui lèvent une erreur claire plutôt que de
 *     simuler un succès.
 */

import { createClient } from '@/lib/supabase/server'
import type { FinancePrintEvent } from '@/lib/facturation/types'
import { cleJourDepuisDateFr } from '../../domain/dates'
import { natureNormalisee, type NaturePaiement } from '../../domain/payment-method'
import { isoVersHorodatage } from './dates'
import type {
  AcquittementAnomalie,
  ImpressionFinance,
  Modification,
  OperationPartagee,
  Recu,
  ReferenceFichier,
  Versement,
} from '../../domain/types'
import type { CorrectionPremierVersement } from '../../domain/rules/edit-sections'
import type { CreationRecu } from '../ports'
import { SectionIndisponibleError } from '../ports'
import { modePaiementDepuisNature } from './codes'
import { centimesVersDh } from './dh'
import { estIdentifiantReel } from './ids'
import { chargerProgrammeActif } from './programme'
import { chargerDetailRecuBrut, messageErreur, recuParId } from './read'
import { deposerVersOperation } from './storage'

type ParametresInstrument = {
  p_payment_mode: string
  p_usage_kind: string
  p_existing_shared_operation_id: string | null
  p_operation_amount_dh: number | null
  p_instrument_reference: string | null
  p_bank_name: string | null
  p_instrument_date: string | null
  p_payer_name: string | null
}

/**
 * Champs d'instrument communs à `Versement` et `CorrectionPremierVersement` :
 * les deux formes que `resoudreParametresInstrument` accepte.
 */
type InstrumentSource = Pick<
  Versement,
  | 'nature'
  | 'portee'
  | 'operationPartageeId'
  | 'referenceInstrument'
  | 'dateInstrument'
  | 'banque'
  | 'payeur'
  | 'montantOperationCentimes'
>

/**
 * Résout les paramètres d'instrument communs à `create_complete_facturation_receipt`,
 * `add_billing_receipt_payment` et `correct_billing_receipt_first_payment_method`
 * à partir d'un `Versement` ou d'une `CorrectionPremierVersement` du domaine.
 */
function resoudreParametresInstrument(
  versement: InstrumentSource,
  nomPayeurParDefaut: string,
): ParametresInstrument {
  // `Versement.nature` est typé `NaturePaiement | string` pour tolérer des
  // graphies libres côté démonstration ; une valeur réelle, elle, est
  // toujours l'une des trois constantes exactes. `natureNormalisee()`
  // absorbe une éventuelle variante avant que `modePaiementDepuisNature()` ne
  // lève une erreur sur toute valeur réellement inconnue.
  const paymentMode = modePaiementDepuisNature(natureNormalisee(versement.nature) as NaturePaiement)

  if (paymentMode === 'cash') {
    return {
      p_payment_mode: 'cash',
      p_usage_kind: 'unique',
      p_existing_shared_operation_id: null,
      p_operation_amount_dh: null,
      p_instrument_reference: null,
      p_bank_name: null,
      p_instrument_date: null,
      p_payer_name: null,
    }
  }

  if (versement.portee === 'shared' && estIdentifiantReel(versement.operationPartageeId)) {
    // Réutilisation d'une opération déjà existante : la RPC interdit de
    // fournir à nouveau les champs d'instrument (§5.8 — verrouillés).
    return {
      p_payment_mode: paymentMode,
      p_usage_kind: 'shared',
      p_existing_shared_operation_id: versement.operationPartageeId,
      p_operation_amount_dh: null,
      p_instrument_reference: null,
      p_bank_name: null,
      p_instrument_date: null,
      p_payer_name: null,
    }
  }

  // Nouvelle opération, unique ou partagée. L'identifiant provisoire du
  // domaine (préfixé, voir `ids.ts`) n'est jamais transmis : la RPC génère le
  // sien.
  const dateInstrumentSql = versement.dateInstrument ? cleJourDepuisDateFr(versement.dateInstrument) : ''
  return {
    p_payment_mode: paymentMode,
    p_usage_kind: versement.portee,
    p_existing_shared_operation_id: null,
    p_operation_amount_dh:
      versement.portee === 'shared' ? centimesVersDh(versement.montantOperationCentimes) : null,
    p_instrument_reference: versement.referenceInstrument,
    p_bank_name: versement.banque,
    p_instrument_date: dateInstrumentSql || null,
    // R-25/R-26 du domaine n'exigent le payeur que pour une opération
    // partagée ; la RPC omra l'exige aussi pour un instrument unique
    // (« Bank instrument details are required »). Repli sur le nom du client
    // du reçu, de fait le seul payeur possible d'un instrument qui lui est
    // propre — accommodation technique documentée, pas une règle inventée.
    p_payer_name: versement.payeur.trim() || nomPayeurParDefaut,
  }
}

/** `RecusPort.reserverNumero`. */
export async function reserverNumeroSupabase(): Promise<number> {
  // omra ne réserve pas de numéro séparément : `create_complete_facturation_receipt`
  // réserve et attribue le numéro dans la même transaction que la création
  // (compteur par saison, `billing_receipt_counters`). Cette valeur n'est ni
  // utilisée pour valider (`create-receipt.ts`, commentaire P08), ni
  // affichée : le numéro réel vient du `Recu` renvoyé par `creer()`.
  return 0
}

/** `RecusPort.creer`. */
export async function creerRecuSupabase(donnees: CreationRecu): Promise<Recu> {
  const programme = await chargerProgrammeActif()
  const hotelId = programme.hotels.find((h) => h.name === donnees.hotel)?.id
  const flightId = programme.flights.find((f) => f.label === donnees.vol)?.id
  const roomId = programme.rooms.find((r) => String(r.bedCount) === donnees.chambre)?.id
  if (!hotelId || !flightId || !roomId) {
    throw new Error('Combinaison hôtel / vol / chambre introuvable dans le programme actif.')
  }
  const rabatteurId = donnees.rabatteur
    ? (programme.rabatteurs.find((r) => r.name === donnees.rabatteur)?.id ?? null)
    : null
  if (donnees.rabatteur && !rabatteurId) {
    throw new Error('Rabatteur introuvable dans le programme actif.')
  }

  const nomClient = `${donnees.prenom} ${donnees.nom}`
  const instrument = resoudreParametresInstrument(donnees.premierVersement, nomClient)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_complete_facturation_receipt', {
    p_season_id: programme.seasonId,
    p_program_id: programme.programId,
    p_hotel_id: hotelId,
    p_flight_id: flightId,
    p_room_id: roomId,
    p_discount_amount_dh: centimesVersDh(donnees.reductionCentimes),
    p_existing_dossier_id: null,
    // Chaque reçu crée son propre dossier technique : `omra_dossiers` exige
    // une référence et ne correspond pas encore au tag groupe/famille du
    // prototype (fusion.md §5.4, non résolu — aucun rapprochement automatique
    // n'est tenté). Le libellé porte le tag saisi ; la référence n'est qu'un
    // identifiant technique.
    p_new_dossier_reference: crypto.randomUUID(),
    p_new_dossier_label: donnees.groupe || null,
    p_new_dossier_note: null,
    p_existing_traveler_id: null,
    // Jamais de réutilisation de voyageur : le domaine n'offre pas ce choix
    // explicitement (CLAUDE.md — la réutilisation doit être un choix
    // explicite, jamais un rapprochement automatique sur le nom).
    p_new_traveler_first_name: donnees.prenom,
    p_new_traveler_last_name: donnees.nom,
    p_new_traveler_phone: donnees.telephone || null,
    p_rabatteur_id: rabatteurId,
    p_registration_note: donnees.note || null,
    p_first_payment_amount_dh: centimesVersDh(donnees.premierVersement.montantCentimes),
    p_payment_mode: instrument.p_payment_mode,
    p_usage_kind: instrument.p_usage_kind,
    p_existing_shared_operation_id: instrument.p_existing_shared_operation_id,
    p_operation_amount_dh: instrument.p_operation_amount_dh,
    p_instrument_reference: instrument.p_instrument_reference,
    p_bank_name: instrument.p_bank_name,
    p_instrument_date: instrument.p_instrument_date,
    p_payer_name: instrument.p_payer_name,
    // La confirmation de dépassement a déjà été obtenue par le domaine avant
    // d'appeler ce port (R-32, `preparerCreationRecu` → `depassementConfirme`) :
    // il n'est jamais invoké tant qu'elle manque. Un dépassement inédit
    // détecté ici (concurrence rare sur une même opération partagée, entre la
    // lecture du domaine et cette écriture) reste tracé intégralement
    // (`payment_operation.over_allocation_confirmed`) — limite résiduelle
    // documentée dans AUDIT-BACKEND.md.
    p_confirm_over_allocation: true,
  })
  if (error) throw new Error(messageErreur(error))

  const receiptId = (data as { receipt_id: string }[] | null)?.[0]?.receipt_id
  if (!receiptId) throw new Error('Création du reçu : réponse inattendue de la base.')

  const recu = await recuParId(receiptId)
  if (!recu) throw new Error('Reçu introuvable juste après sa création.')
  return recu
}

/** `RecusPort.ajouterVersement`. */
export async function ajouterVersementSupabase(recuId: string, versement: Versement): Promise<Recu> {
  const detail = await chargerDetailRecuBrut(recuId)
  if (!detail) throw new Error('Reçu introuvable pour l’ajout du versement.')

  const nomClient = `${detail.registration.first_name_snapshot} ${detail.registration.last_name_snapshot}`
  const instrument = resoudreParametresInstrument(versement, nomClient)

  const supabase = await createClient()
  const { error } = await supabase.rpc('add_billing_receipt_payment', {
    p_receipt_id: recuId,
    p_payment_amount_dh: centimesVersDh(versement.montantCentimes),
    p_payment_mode: instrument.p_payment_mode,
    p_usage_kind: instrument.p_usage_kind,
    p_existing_shared_operation_id: instrument.p_existing_shared_operation_id,
    p_operation_amount_dh: instrument.p_operation_amount_dh,
    p_instrument_reference: instrument.p_instrument_reference,
    p_bank_name: instrument.p_bank_name,
    p_instrument_date: instrument.p_instrument_date,
    p_payer_name: instrument.p_payer_name,
    p_confirm_over_allocation: true,
  })
  if (error) throw new Error(messageErreur(error))

  const recu = await recuParId(recuId)
  if (!recu) throw new Error('Reçu introuvable après l’ajout du versement.')
  return recu
}

/** `RecusPort.annuler`. Plafond R-46 déjà appliqué par le domaine (`cancellation.ts`) avant l'appel. */
export async function annulerRecuSupabase(
  recuId: string,
  donnees: {
    motif: string
    annulePar: string
    annuleLe: string
    modeRemboursement: 'cash' | 'none'
    montantRembourseCentimes: number
  },
): Promise<Recu> {
  // §5.10/§5.11 — la sortie de caisse réelle est 0 ou le montant déjà
  // plafonné par le domaine (`min(totalPaye, convenu)`), jamais une valeur
  // intermédiaire : `modeRemboursement === 'none'` signifie une restitution
  // hors caisse, donc aucune sortie ici.
  const cashOutflowDh =
    donnees.modeRemboursement === 'cash' ? centimesVersDh(donnees.montantRembourseCentimes) : 0

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_billing_receipt', {
    p_receipt_id: recuId,
    p_reason: donnees.motif,
    p_cash_outflow_amount_dh: cashOutflowDh,
  })
  if (error) throw new Error(messageErreur(error))

  const recu = await recuParId(recuId)
  if (!recu) throw new Error('Reçu introuvable après annulation.')
  return recu
}

/** `RecusPort.appliquerModification`. Jamais appelée pour `firstPayment` (voir `service.ts`, `modifierRecu`). */
export async function appliquerModificationSupabase(
  recuId: string,
  champsModifies: Partial<Recu>,
  modification: Modification,
): Promise<Recu> {
  const supabase = await createClient()

  switch (modification.section) {
    case 'identity': {
      const { error } = await supabase.rpc('update_billing_receipt_personal_data', {
        p_receipt_id: recuId,
        p_section_code: 'identity',
        p_new_first_name: champsModifies.prenom ?? null,
        p_new_last_name: champsModifies.nom ?? null,
        p_new_phone: null,
        p_new_note: null,
        p_reason: modification.motif,
      })
      if (error) throw new Error(messageErreur(error))
      break
    }
    case 'contact': {
      const { error } = await supabase.rpc('update_billing_receipt_personal_data', {
        p_receipt_id: recuId,
        p_section_code: 'phone',
        p_new_first_name: null,
        p_new_last_name: null,
        p_new_phone: champsModifies.telephone ?? null,
        p_new_note: null,
        p_reason: modification.motif,
      })
      if (error) throw new Error(messageErreur(error))
      break
    }
    case 'note': {
      const { error } = await supabase.rpc('update_billing_receipt_personal_data', {
        p_receipt_id: recuId,
        p_section_code: 'note',
        p_new_first_name: null,
        p_new_last_name: null,
        p_new_phone: null,
        p_new_note: champsModifies.note ?? '',
        p_reason: modification.motif,
      })
      if (error) throw new Error(messageErreur(error))
      break
    }
    case 'program': {
      const programme = await chargerProgrammeActif()
      const hotelId = programme.hotels.find((h) => h.name === champsModifies.hotel)?.id
      const flightId = programme.flights.find((f) => f.label === champsModifies.vol)?.id
      const roomId = programme.rooms.find((r) => String(r.bedCount) === champsModifies.chambre)?.id
      if (!hotelId || !flightId || !roomId) {
        throw new Error('Combinaison hôtel / vol / chambre introuvable dans le programme actif.')
      }
      const { error } = await supabase.rpc('update_billing_receipt_commercial_data', {
        p_receipt_id: recuId,
        p_hotel_id: hotelId,
        p_flight_id: flightId,
        p_room_id: roomId,
        p_discount_amount_dh: centimesVersDh(champsModifies.reductionCentimes ?? 0),
        p_reason: modification.motif,
      })
      if (error) throw new Error(messageErreur(error))
      break
    }
    case 'group':
      // fusion.md §5.4 — `update_billing_receipt_dossier` déplace une
      // inscription entre dossiers réels (existant ou technique isolé) ; le
      // domaine attend un simple changement de libellé texte libre. Les deux
      // ne coïncident pas encore : reprise nécessaire avant de brancher cette
      // section, pas une décision à improviser ici. `SectionIndisponibleError`
      // (et non une `Error` générique) pour que modifierRecu() la reconnaisse
      // et renvoie un message propre au lieu de bloquer la fenêtre.
      throw new SectionIndisponibleError(
        "La modification du groupe n'est pas encore disponible côté omra : le modèle de dossier réel (update_billing_receipt_dossier) ne correspond pas encore au tag libre du prototype (fusion.md §5.4, non résolu).",
      )
    default:
      throw new Error(`Section de modification non prise en charge côté omra : ${JSON.stringify(modification.section)}`)
  }

  const recu = await recuParId(recuId)
  if (!recu) throw new Error('Reçu introuvable après modification.')
  return recu
}

/**
 * `RecusPort.corrigerPremierVersement` — reprise fusion.md §4.2 / étape 8.
 *
 * `correct_billing_receipt_first_payment_method` (migration 202608030006,
 * déployée) remplace `202608020004` évoquée dans une version antérieure de ce
 * commentaire : elle plafonne déjà la correction au montant convenu et
 * réserve le changement de montant à l'administrateur côté base, en plus du
 * contrôle déjà fait par le domaine (`preparerModification`, §5.9).
 *
 * `nouvelleOperation` n'est jamais créée séparément ici : comme pour
 * `creerRecuSupabase`/`ajouterVersementSupabase`, c'est la RPC elle-même qui
 * crée l'opération quand `p_existing_shared_operation_id` est absent —
 * `resoudreParametresInstrument` le détermine à partir de `estIdentifiantReel`.
 */
export async function corrigerPremierVersementSupabase(
  recuId: string,
  versement: CorrectionPremierVersement,
  _nouvelleOperation: OperationPartagee | null,
  modification: Modification,
): Promise<Recu> {
  const detail = await chargerDetailRecuBrut(recuId)
  if (!detail) throw new Error('Reçu introuvable pour la correction du premier versement.')

  const nomClient = `${detail.registration.first_name_snapshot} ${detail.registration.last_name_snapshot}`
  const instrument = resoudreParametresInstrument(versement, nomClient)

  const supabase = await createClient()
  const { error } = await supabase.rpc('correct_billing_receipt_first_payment_method', {
    p_receipt_id: recuId,
    p_reason: modification.motif,
    p_new_amount_dh: centimesVersDh(versement.montantCentimes),
    p_payment_mode: instrument.p_payment_mode,
    p_usage_kind: instrument.p_usage_kind,
    p_existing_shared_operation_id: instrument.p_existing_shared_operation_id,
    p_operation_amount_dh: instrument.p_operation_amount_dh,
    p_instrument_reference: instrument.p_instrument_reference,
    p_bank_name: instrument.p_bank_name,
    p_instrument_date: instrument.p_instrument_date,
    p_payer_name: instrument.p_payer_name,
    // Le domaine a déjà obtenu la confirmation avant d'appeler ce port
    // (R-32, preparerModification → confirmation-requise), comme pour
    // creerRecuSupabase/ajouterVersementSupabase ci-dessus.
    p_confirm_over_allocation: true,
  })
  if (error) throw new Error(messageErreur(error))

  const recu = await recuParId(recuId)
  if (!recu) throw new Error('Reçu introuvable après correction du premier versement.')
  return recu
}

/**
 * `RecusPort.incrementerImpressions` — R-84. Enregistre un événement
 * d'impression via `record_billing_receipt_print` (migration
 * `202608020003`) et renvoie le nouveau numéro d'impression.
 */
export async function incrementerImpressionsSupabase(recuId: string): Promise<number> {
  const supabase = await createClient()
  const resultat = await supabase.rpc('record_billing_receipt_print', {
    p_receipt_id: recuId,
  })
  if (resultat.error) throw new Error(messageErreur(resultat.error))
  const ligne = (resultat.data as { print_number: number }[] | null)?.[0]
  if (!ligne) throw new Error("record_billing_receipt_print n'a renvoyé aucun événement.")
  return ligne.print_number
}

/** `RecusPort.definirImagesPasseport` — hors périmètre du noyau omra (CLAUDE.md §8, reprise.md R-90). */
export async function definirImagesPasseportSupabase(): Promise<void> {
  throw new Error(
    "Les images de passeport ne sont pas disponibles côté omra : le passeport est hors périmètre du noyau (CLAUDE.md §8, reprise.md R-90).",
  )
}

/**
 * Associe ou retire l'image justificative d'une opération de paiement.
 * Partagée par `RecusPort.definirImageVersement` (instrument unique) et
 * `OperationsPartageesPort.definirImage` (opération partagée).
 */
async function appliquerImageOperation(operationId: string, image: ReferenceFichier | null): Promise<void> {
  const supabase = await createClient()

  if (image === null) {
    const { error } = await supabase.rpc('delete_payment_operation_evidence_image', {
      p_operation_id: operationId,
      // R-39/R-40 — suppression réservée à l'administrateur, déjà vérifié par
      // `service.ts` avant d'appeler ce port ; `require_facturation_admin()`
      // le revérifie côté serveur. Le domaine ne collecte aucun motif pour
      // cette action précise alors que la RPC en exige un non vide :
      // accommodation technique documentée, pas une valeur métier inventée.
      p_reason: 'Suppression demandée depuis l’écran Facturation.',
    })
    if (error) throw new Error(messageErreur(error))
    return
  }

  const { storagePath, mimeType } = await deposerVersOperation(image, operationId)
  const { error } = await supabase.rpc('attach_payment_operation_evidence_image', {
    p_operation_id: operationId,
    p_storage_path: storagePath,
    p_original_file_name: image.nomOrigine,
    p_mime_type: mimeType,
  })
  if (error) throw new Error(messageErreur(error))
}

/** `RecusPort.definirImageVersement` — instrument unique porté par le versement lui-même (R-38). */
export async function definirImageVersementSupabase(
  recuId: string,
  versementId: string,
  image: ReferenceFichier | null,
): Promise<void> {
  const detail = await chargerDetailRecuBrut(recuId)
  if (!detail) throw new Error('Reçu introuvable pour l’image du versement.')

  const paiement = detail.payments.find((p) => p.id === versementId)
  if (!paiement || !paiement.payment_operation_id) {
    throw new Error('Versement introuvable ou sans opération associée pour l’image.')
  }

  await appliquerImageOperation(paiement.payment_operation_id, image)
}

/** `OperationsPartageesPort.definirImage` — instrument porté par une opération partagée. */
export async function definirImageOperationSupabase(
  operationId: string,
  image: ReferenceFichier | null,
): Promise<void> {
  await appliquerImageOperation(operationId, image)
}

/**
 * `AcquittementsAnomaliePort.acquitter` — Lot Finance, étape 4b (fusion.md
 * §5). Réservé à l'administrateur : `acknowledge_billing_finance_anomalies`
 * appelle `require_facturation_admin()` et lève une erreur claire pour tout
 * autre appelant, jamais un faux succès.
 */
export async function acquitterAnomaliesSupabase(
  acquittement: AcquittementAnomalie,
  saisonId: string,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('acknowledge_billing_finance_anomalies', {
    p_season_id: saisonId,
    p_day: acquittement.jour,
    p_movement_ids: acquittement.mouvementIds,
  })
  if (error) throw new Error(messageErreur(error))
}

/**
 * `ImpressionsFinancePort.creer` — Lot Finance, étape 4c (fusion.md §5).
 * reprise.md §5.12 : le compteur doit être écrit avant l'ouverture de la
 * boîte système ; c'est `sequenceImpression`/`ui/ecrans/finance.tsx` (comme
 * pour le reçu, P18) qui garantit cet ordre, pas cette fonction.
 */
export async function creerImpressionFinanceSupabase(
  impression: ImpressionFinance,
  saisonId: string,
): Promise<ImpressionFinance> {
  const supabase = await createClient()
  const resultat = await supabase.rpc('record_billing_finance_print', {
    p_season_id: saisonId,
    p_day: impression.jour,
    p_movement_ids: impression.mouvementIds,
  })
  if (resultat.error) throw new Error(messageErreur(resultat.error))
  const ligne = (resultat.data as FinancePrintEvent[] | null)?.[0]
  if (!ligne) throw new Error("record_billing_finance_print n'a renvoyé aucun événement.")
  return {
    id: `${saisonId}:${impression.jour}:${ligne.print_number}`,
    jour: impression.jour,
    imprimeLe: isoVersHorodatage(ligne.printed_at),
    employe: ligne.printed_by_slot_label_snapshot,
    numeroImpression: ligne.print_number,
    mouvementIds: ligne.movement_ids,
    nombreLignes: ligne.row_count,
  }
}
