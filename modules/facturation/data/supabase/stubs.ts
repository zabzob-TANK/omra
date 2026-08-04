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
import { listerMouvementsCaisseReel } from './read'

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
 * Lot Finance, étapes 4b (acquittement) et 4c (impression du journal) —
 * tables non encore créées côté omra. En attendant, ces lectures renvoient
 * une valeur vide correcte (aucune impression, aucun acquittement n'existe
 * réellement) plutôt que de lever une erreur qui bloquerait tout l'écran
 * Finance/Suivi : ce n'est pas un faux succès, c'est l'état réel du système
 * avant que 4b/4c ne soient construits.
 */
export const impressionsFinanceSupabase: ImpressionsFinancePort = {
  async listerParJour() {
    return []
  },
  async creer() {
    return indisponible('impressionsFinance.creer')
  },
}

export const acquittementsAnomalieSupabase: AcquittementsAnomaliePort = {
  async parJour() {
    return null
  },
  async acquitter() {
    return indisponible('acquittementsAnomalie.acquitter')
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
