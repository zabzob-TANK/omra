import 'server-only'

/**
 * Lecture réelle depuis Supabase : appelle les RPC existantes et construit
 * des entités du domaine via `mappers.ts`.
 *
 * Identité et sécurité (règle absolue n°4) : ce fichier n'utilise jamais de
 * clé `service_role`. `createClient()` (`@/lib/supabase/server`) construit un
 * client lié à la session du cookie de l'utilisateur connecté ; chaque appel
 * RPC s'exécute donc sous son rôle Postgres `authenticated`, et c'est
 * `resolve_facturation_actor()` côté serveur SQL qui détermine l'identité et
 * l'autorisation — jamais une valeur fournie par ce code.
 *
 * Ce fichier n'est pas testé unitairement : il n'a pas de logique propre en
 * dehors de l'appel RPC et de la délégation aux fonctions pures de
 * `mappers.ts`, déjà testées. Un test unitaire nécessiterait une session
 * Supabase réelle — hors périmètre d'un test en mémoire.
 */

import { createClient } from '@/lib/supabase/server'
import type {
  BillingAnomaly,
  BillingReceiptDetail,
  BillingReceiptRow,
  CashRegisterRefundMovement,
  FinanceAnomalyAcknowledgement,
  FinancePrintEvent,
  ReusablePaymentOperation,
} from '@/lib/facturation/types'
import { cleJourDepuisDateFr } from '../../domain/dates'
import { dhVersCentimes } from './dh'
import { isoVersDateFr, isoVersHeure, isoVersHorodatage } from './dates'
import type { FiltreRecus } from '../ports'
import type {
  AcquittementAnomalie,
  ImpressionFinance,
  MouvementCaisse,
  OperationPartagee,
  Recu,
} from '../../domain/types'
import { mapReceiptDetailToRecu, mapReusableOperationToOperationPartagee } from './mappers'

const TAILLE_PAGE = 200

export function messageErreur(erreur: { message?: string } | null): string {
  const message = erreur?.message?.trim()
  return message || 'Impossible de charger les données de Facturation.'
}

/** Récupère toutes les lignes de `list_billing_receipts`, en paginant jusqu'à épuisement. */
async function listerLignesRecus(filtre?: FiltreRecus): Promise<BillingReceiptRow[]> {
  const supabase = await createClient()
  const lignes: BillingReceiptRow[] = []

  const texteRecherche = filtre?.numero?.trim() || filtre?.nom?.trim() || null
  const statutCycleVie = filtre?.inclureAnnules ? null : 'active'

  for (let offset = 0; ; offset += TAILLE_PAGE) {
    const resultat = await supabase.rpc('list_billing_receipts', {
      p_search_text: texteRecherche,
      p_lifecycle_status: statutCycleVie,
      // reprise.md §5.3 — un écran ne mélange jamais les saisons.
      p_season_id: filtre?.saisonId ?? null,
      p_limit: TAILLE_PAGE,
      p_offset: offset,
    })
    if (resultat.error) throw new Error(messageErreur(resultat.error))
    const page = (resultat.data ?? []) as BillingReceiptRow[]
    lignes.push(...page)
    if (page.length < TAILLE_PAGE) break
  }

  // Le filtre `numero` doit être une correspondance exacte ; la RPC ne fait
  // qu'une recherche par sous-chaîne (`ilike '%...%'`), qui matcherait aussi
  // bien 12 que 112 ou 120.
  if (filtre?.numero?.trim()) {
    const numero = Number(filtre.numero.trim())
    return lignes.filter((ligne) => ligne.receipt_number === numero)
  }

  // Si `nom` ET `numero` sont fournis ensemble, affiner côté client : la RPC
  // n'accepte qu'un seul texte de recherche à la fois.
  if (filtre?.nom?.trim() && texteRecherche === filtre.numero?.trim()) {
    const aiguille = filtre.nom.trim().toLowerCase()
    return lignes.filter(
      (ligne) =>
        ligne.traveler_first_name_snapshot.toLowerCase().includes(aiguille) ||
        ligne.traveler_last_name_snapshot.toLowerCase().includes(aiguille),
    )
  }

  return lignes
}

/**
 * Détail brut de `get_billing_receipt_details`, avant traduction vers le
 * domaine. Exporté pour l'adaptateur d'écriture (`write.ts`), qui a besoin de
 * champs bruts que la traduction n'expose pas — par exemple
 * `payment_operation_id` d'un versement unique, volontairement effacé dans
 * `Versement.operationPartageeId` par `mapVersement()` (R-38).
 */
export async function chargerDetailRecuBrut(id: string): Promise<BillingReceiptDetail | null> {
  const supabase = await createClient()
  const resultat = await supabase.rpc('get_billing_receipt_details', { p_receipt_id: id })
  if (resultat.error) {
    if (resultat.error.message?.includes('not found')) return null
    throw new Error(messageErreur(resultat.error))
  }
  return (resultat.data as BillingReceiptDetail | null) ?? null
}

/** Construit un `Recu` complet pour un identifiant de reçu donné. */
async function chargerRecuParId(id: string): Promise<Recu | null> {
  const detail = await chargerDetailRecuBrut(id)
  return detail ? mapReceiptDetailToRecu(detail) : null
}

/**
 * `RecusPort.lister` (partie lecture uniquement).
 *
 * Liste puis charge le détail de chaque reçu pour construire des `Recu`
 * complets avec leurs versements — la RPC de liste ne renvoie que des
 * agrégats. Même stratégie que `lib/facturation/read-server.ts`, par lots de
 * 20 appels en parallèle.
 */
export async function listerRecus(filtre?: FiltreRecus): Promise<Recu[]> {
  const lignes = await listerLignesRecus(filtre)
  const recus: Recu[] = []

  for (let offset = 0; offset < lignes.length; offset += 20) {
    const lot = lignes.slice(offset, offset + 20)
    const resultats = await Promise.all(lot.map((ligne) => chargerRecuParId(ligne.receipt_id)))
    for (const recu of resultats) {
      if (recu) recus.push(recu)
    }
  }

  return recus
}

/** `RecusPort.parId` (partie lecture uniquement). */
export async function recuParId(id: string): Promise<Recu | null> {
  return chargerRecuParId(id)
}

/**
 * `RecusPort.parNumero` (partie lecture uniquement).
 *
 * Aucune RPC n'accepte un numéro de reçu exact : on passe par la recherche
 * texte de `list_billing_receipts`, filtrée exactement côté client, puis on
 * charge le détail du reçu trouvé.
 *
 * reprise.md §5.3 — l'unicité réelle d'un reçu est saison + numéro, jamais le
 * numéro seul. `saisonId` fourni, la recherche s'y limite ; si plus d'une
 * correspondance survit malgré tout, on refuse (`null`) plutôt que de deviner
 * en prenant la première trouvée.
 */
export async function recuParNumero(numero: number, saisonId?: string): Promise<Recu | null> {
  const lignes = await listerLignesRecus({ numero: String(numero), saisonId })
  const correspondances = lignes.filter((candidate) => candidate.receipt_number === numero)
  if (correspondances.length !== 1) return null
  return chargerRecuParId(correspondances[0].receipt_id)
}

/**
 * Partie lecture de `OperationsPartageesPort.lister`.
 *
 * `list_reusable_payment_operations` ne renvoie que les opérations
 * partagées chèque/virement — ce qui couvre en réalité toutes les opérations
 * partagées possibles, puisque l'espèce ne peut être que `unique` (règle
 * métier). Voir `mappers.ts` pour les champs non disponibles depuis cette RPC
 * (créateur, statut archivé, image).
 *
 * `saisonId` isole strictement par saison (202608040005, déployée
 * 2026-08-06) : une opération partagée ayant ne serait-ce qu'une allocation
 * hors de `saisonId` disparaît entièrement de la liste, même s'il lui reste
 * un solde réel non alloué — décision du commanditaire, aucun pont entre
 * saisons archivées et saison active.
 */
export async function listerOperationsPartageesReutilisables(
  mode: 'cheque' | 'transfer' | null = null,
  saisonId: string | null = null,
): Promise<OperationPartagee[]> {
  const supabase = await createClient()
  const resultat = await supabase.rpc('list_reusable_payment_operations', {
    p_payment_mode: mode,
    p_season_id: saisonId,
  })
  if (resultat.error) throw new Error(messageErreur(resultat.error))
  const lignes = (resultat.data ?? []) as ReusablePaymentOperation[]
  return lignes.map(mapReusableOperationToOperationPartagee)
}

/**
 * `MouvementsCaissePort.listerParJour`/`.lister` — Lot Finance, étape 4a
 * (fusion.md §5). `cash_register_movements` existe déjà (annulation avec
 * remboursement espèces, `cancel_billing_receipt`) ; `list_cash_register_refund_movements`
 * (202608040002) se contente de l'exposer en lecture, jointe au reçu et au
 * voyageur. `p_season_id` respecte reprise.md §5.3 — un écran ne mélange
 * jamais les saisons.
 */
export async function listerMouvementsCaisseReel(saisonId: string | null): Promise<MouvementCaisse[]> {
  const supabase = await createClient()
  const resultat = await supabase.rpc('list_cash_register_refund_movements', {
    p_season_id: saisonId,
  })
  if (resultat.error) throw new Error(messageErreur(resultat.error))
  const lignes = (resultat.data ?? []) as CashRegisterRefundMovement[]
  return lignes.map((ligne) => {
    const date = isoVersDateFr(ligne.occurred_at)
    return {
      id: ligne.movement_id,
      type: 'refund_cash',
      jour: cleJourDepuisDateFr(date),
      date,
      heure: isoVersHeure(ligne.occurred_at),
      montantCentimes: dhVersCentimes(ligne.amount_dh),
      recuNumero: ligne.receipt_number,
      client: `${ligne.traveler_first_name_snapshot} ${ligne.traveler_last_name_snapshot}`.trim(),
      employe: ligne.created_by_slot_label_snapshot,
    }
  })
}

/**
 * `AcquittementsAnomaliePort.parJour` — Lot Finance, étape 4b (fusion.md §5).
 * Lecture de `get_billing_finance_anomaly_acknowledgement`, nouvelle table
 * `facturation_anomaly_acknowledgements` (202608040003).
 */
export async function chargerAcquittementAnomalieReel(
  saisonId: string,
  jour: string,
): Promise<AcquittementAnomalie | null> {
  const supabase = await createClient()
  const resultat = await supabase.rpc('get_billing_finance_anomaly_acknowledgement', {
    p_season_id: saisonId,
    p_day: jour,
  })
  if (resultat.error) throw new Error(messageErreur(resultat.error))
  const ligne = (resultat.data as FinanceAnomalyAcknowledgement[] | null)?.[0]
  if (!ligne) return null
  return {
    // `day_key` (colonne `date` Postgres) est déjà au format `aaaa-mm-jj` : c'est
    // exactement le format `CleJour` attendu par le domaine, aucune conversion.
    jour: ligne.day_key,
    mouvementIds: ligne.movement_ids,
    acquitteLe: isoVersHorodatage(ligne.acknowledged_at),
    acquittePar: ligne.acknowledged_by_slot_label_snapshot,
  }
}

/**
 * `ImpressionsFinancePort.listerParJour` — Lot Finance, étape 4c (fusion.md
 * §5). Lecture de `list_billing_finance_print_events`, nouvelle table
 * `facturation_finance_print_events` (202608040004).
 */
export async function listerImpressionsFinanceReel(
  saisonId: string,
  jour: string,
): Promise<ImpressionFinance[]> {
  const supabase = await createClient()
  const resultat = await supabase.rpc('list_billing_finance_print_events', {
    p_season_id: saisonId,
    p_day: jour,
  })
  if (resultat.error) throw new Error(messageErreur(resultat.error))
  const lignes = (resultat.data ?? []) as FinancePrintEvent[]
  return lignes.map((ligne) => ({
    // Aucune colonne `id` propre n'est exposée par la RPC ; (saison, jour,
    // numéro) identifie déjà une impression de façon unique et stable.
    id: `${saisonId}:${jour}:${ligne.print_number}`,
    jour,
    imprimeLe: isoVersHorodatage(ligne.printed_at),
    employe: ligne.printed_by_slot_label_snapshot,
    numeroImpression: ligne.print_number,
    mouvementIds: ligne.movement_ids,
    nombreLignes: ligne.row_count,
  }))
}

/**
 * Anomalie brute, telle que renvoyée par `list_billing_anomalies`.
 *
 * ⚠️ Ne correspond à aucun port de `ports.ts`. `AcquittementsAnomaliePort` ne
 * porte que l'acquittement (par jour, par administrateur) ; le domaine calcule
 * lui-même ses anomalies depuis les reçus et mouvements de caisse
 * (`rules/daily.ts`, `rules/finance-day.ts`), il ne les lit pas d'un dépôt.
 * Cette fonction est fournie telle quelle, en dehors de `SourceDonnees`, en
 * attendant une décision sur son usage — voir le rapport de portage.
 */
export type AnomalieBase = BillingAnomaly

export async function listerAnomaliesBase(seasonId: string | null = null): Promise<AnomalieBase[]> {
  const supabase = await createClient()
  const anomalies: AnomalieBase[] = []

  for (let offset = 0; ; offset += TAILLE_PAGE) {
    const resultat = await supabase.rpc('list_billing_anomalies', {
      p_season_id: seasonId,
      p_limit: TAILLE_PAGE,
      p_offset: offset,
    })
    if (resultat.error) throw new Error(messageErreur(resultat.error))
    const page = (resultat.data ?? []) as AnomalieBase[]
    anomalies.push(...page)
    if (page.length < TAILLE_PAGE) break
  }

  return anomalies
}
