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

function indisponible(nom: string): never {
  throw new Error(
    `${nom} n'est pas disponible côté omra : fusion.md §5 renvoie ce lot (journal financier) à un travail dédié, non couvert par cette étape.`,
  )
}

export const mouvementsCaisseSupabase: MouvementsCaissePort = {
  async listerParJour() {
    return indisponible('mouvementsCaisse.listerParJour')
  },
  async lister() {
    return indisponible('mouvementsCaisse.lister')
  },
  async creer() {
    return indisponible('mouvementsCaisse.creer')
  },
}

export const impressionsFinanceSupabase: ImpressionsFinancePort = {
  async listerParJour() {
    return indisponible('impressionsFinance.listerParJour')
  },
  async creer() {
    return indisponible('impressionsFinance.creer')
  },
}

export const acquittementsAnomalieSupabase: AcquittementsAnomaliePort = {
  async parJour() {
    return indisponible('acquittementsAnomalie.parJour')
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
