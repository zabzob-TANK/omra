import 'server-only'

/**
 * Ports sans contrepartie actuelle côté omra (fusion.md §5 : journal
 * financier, impression du journal financier, acquittement d'anomalie —
 * renvoyés à un lot dédié, hors périmètre de cette étape).
 *
 * Chaque méthode lève une erreur claire à l'APPEL seulement, jamais à la
 * construction : le reste de l'application (registre, nouveau reçu,
 * versement, annulation, modification) continue de fonctionner sans jamais
 * toucher ces ports.
 */

import type {
  AcquittementsAnomaliePort,
  ImpressionsFinancePort,
  JournalAuditPort,
  LecteurPasseportPort,
  MouvementsCaissePort,
} from '../ports'
import { chargerAcquittementAnomalieReel, listerMouvementsCaisseReel } from './read'
import { acquitterAnomaliesSupabase } from './write'

function indisponible(nom: string): never {
  throw new Error(
    `${nom} n'est pas disponible côté omra : fusion.md §5 renvoie ce lot (journal financier) à un travail dédié, non couvert par cette étape.`,
  )
}

/**
 * Lot Finance, étape 4a (fusion.md §5) : la lecture des sorties de caisse
 * réelles (`cash_register_movements`, via `list_cash_register_refund_movements`,
 * 202608040002) est désormais branchée. `creer()` reste indisponible — aucune
 * écriture nouvelle n'est nécessaire ici, `cancel_billing_receipt` alimente
 * déjà cette table de façon atomique (`write.ts`, `annulerRecuSupabase`) ;
 * `service.ts` ignore résilamment un échec de cet appel (voir `annulerRecu`).
 */
export const mouvementsCaisseSupabase: MouvementsCaissePort = {
  async listerParJour(jour, saisonId) {
    const tous = await listerMouvementsCaisseReel(saisonId ?? null)
    return tous.filter((mouvement) => mouvement.jour === jour)
  },
  async lister(saisonId) {
    return listerMouvementsCaisseReel(saisonId ?? null)
  },
  async creer() {
    return indisponible('mouvementsCaisse.creer')
  },
}

/**
 * Lot Finance, étape 4c (impression du journal) — table non encore créée
 * côté omra. En attendant, cette lecture renvoie une valeur vide correcte
 * (aucune impression du journal n'existe réellement) plutôt que de lever une
 * erreur qui bloquerait tout l'écran Finance/Suivi : ce n'est pas un faux
 * succès, c'est l'état réel du système avant que 4c ne soit construit.
 */
export const impressionsFinanceSupabase: ImpressionsFinancePort = {
  async listerParJour() {
    return []
  },
  async creer() {
    return indisponible('impressionsFinance.creer')
  },
}

/**
 * Lot Finance, étape 4b (fusion.md §5) : lecture et acquittement réels,
 * réservés à l'administrateur (`facturation_anomaly_acknowledgements`,
 * 202608040003). `saisonId` est requis pour l'écriture — `service.ts` le
 * fournit toujours (reprise.md §5.3, saison active résolue en amont).
 */
export const acquittementsAnomalieSupabase: AcquittementsAnomaliePort = {
  async parJour(jour, saisonId) {
    if (!saisonId) return null
    return chargerAcquittementAnomalieReel(saisonId, jour)
  },
  async acquitter(acquittement, saisonId) {
    if (!saisonId) throw new Error('Saison requise pour acquitter une anomalie.')
    await acquitterAnomaliesSupabase(acquittement, saisonId)
  },
}

/**
 * Non-op intentionnel, pas un manque : `facturation_action_history`,
 * alimentée automatiquement par chaque RPC d'écriture, fournit déjà une
 * piste d'audit structurée et complète. Dupliquer un second journal ici
 * ajouterait une source de vérité concurrente, jamais garantie cohérente
 * avec la première.
 */
export const journalAuditSupabase: JournalAuditPort = {
  async lister() {
    return []
  },
  async enregistrer() {},
}

/** R-90 — aucune lecture automatique de passeport côté omra (hors périmètre du noyau). */
export const lecteurPasseportSupabase: LecteurPasseportPort = {
  async lire() {
    return null
  },
  disponible() {
    return false
  },
}
