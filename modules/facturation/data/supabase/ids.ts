/**
 * Horloge et identifiants — implémentations partagées de l'adaptateur d'écriture.
 *
 * Les entités réellement persistées (reçu, versement, opération) reçoivent
 * toujours leur identifiant du serveur PostgreSQL (`gen_random_uuid()`),
 * jamais de celui-ci : `nouvelId()` ne sert qu'à donner une identité
 * provisoire aux objets que le domaine construit avant persistance
 * (`IdentifiantsPort`, ex. `nouvelIdOperation()` dans `create-receipt.ts`).
 *
 * Chaque identifiant provisoire porte un préfixe (`SOP-`, `versement-`, …)
 * suivi d'un UUID, ce qui le distingue toujours d'un identifiant réel de la
 * base — qui est un UUID nu, sans préfixe. `estIdentifiantReel()` exploite
 * cette différence pour savoir, côté écriture, si un identifiant transmis
 * désigne une ligne déjà en base ou un simple espace réservé côté domaine.
 */

import type { HorlogePort, IdentifiantsPort } from '../ports'

export const horloge: HorlogePort = {
  maintenant: () => new Date(),
}

export const identifiants: IdentifiantsPort = {
  nouvelId: (prefixe: string) => `${prefixe}-${crypto.randomUUID()}`,
}

const FORME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Vrai si `valeur` est un UUID nu — donc un identifiant réel de la base. */
export function estIdentifiantReel(valeur: string): boolean {
  return FORME_UUID.test(valeur)
}
