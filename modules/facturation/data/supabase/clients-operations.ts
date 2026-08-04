import 'server-only'

/**
 * `ClientsPort` et la partie écriture d'`OperationsPartageesPort`.
 *
 * omra crée voyageur + inscription + reçu + premier versement + opération de
 * paiement **atomiquement**, en une seule RPC (`create_complete_facturation_receipt`,
 * appelée depuis `write.ts`). Le prototype, lui, les traite comme deux dépôts
 * distincts : `service.ts` appelle `clients.creer()` puis
 * `operationsPartagees.creer()` avant `recus.creer()`/`ajouterVersement()`.
 *
 * Toutes les méthodes ci-dessous sont donc des no-op assumés : le travail
 * réel a déjà eu lieu (ou aura lieu) dans `write.ts`, qui reconnaît une
 * opération « nouvelle » à son identifiant provisoire plutôt qu'à un objet
 * transmis séparément (`ids.ts`, `estIdentifiantReel`).
 */

import type { Client, OperationPartagee } from '../../domain/types'
import type { ClientsPort, OperationsPartageesPort } from '../ports'
import { listerOperationsPartageesReutilisables } from './read'
import { definirImageOperationSupabase } from './write'

export const clientsSupabase: ClientsPort = {
  async lister() {
    // Jamais appelé par `service.ts` : voyageurs et inscriptions sont créés
    // par la RPC atomique de `write.ts`, jamais listés via ce port.
    return []
  },
  async parId() {
    return null
  },
  async creer(client: Client) {
    return client
  },
  async rattacherRecu() {
    // Le rattachement existe déjà nativement (`traveler_registrations.traveler_id`),
    // posé par la même RPC atomique que la création du reçu.
  },
}

export const operationsPartageesSupabase: OperationsPartageesPort = {
  lister: (saisonId) => listerOperationsPartageesReutilisables(null, saisonId ?? null),
  async parId(id: string) {
    const toutes = await listerOperationsPartageesReutilisables()
    return toutes.find((operation) => operation.id === id) ?? null
  },
  async creer(operation: OperationPartagee) {
    return operation
  },
  definirImage: definirImageOperationSupabase,
}
