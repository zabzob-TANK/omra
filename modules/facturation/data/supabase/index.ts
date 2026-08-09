/**
 * Point d'assemblage de l'adaptateur Supabase : implémente `SourceDonnees`
 * (`ports.ts`) sur les RPC réelles du projet officiel omra.
 *
 * Aucun état par requête n'est nécessaire ici — chaque méthode appelle
 * `createClient()`/`createAdminClient()` en interne, déjà liés à la requête
 * en cours (cookies, `next/headers`) — donc un unique objet partagé suffit,
 * sans fabrique ni instance mémorisée (contrairement à l'adaptateur de
 * démonstration, qui doit conserver un état en mémoire entre les appels).
 */

import type { RecusPort, SourceDonnees } from '../ports'
import { clientsSupabase, operationsPartageesSupabase } from './clients-operations'
import { horloge, identifiants } from './ids'
import { referentielsSupabase } from './referentiels'
import {
  listerAnomaliesBase,
  listerModificationsSaison,
  listerOperationsPartageesReutilisables,
  listerRecus,
  listerRecusLeger,
  listerVersementsSaison,
  recuParId,
  recuParNumero,
} from './read'
import { sessionSupabase } from './session'
import { stockageSupabase } from './storage'
import {
  acquittementsAnomalieSupabase,
  impressionsFinanceSupabase,
  journalAuditSupabase,
  lecteurPasseportSupabase,
  mouvementsCaisseSupabase,
} from './stubs'
import {
  ajouterVersementSupabase,
  annulerRecuSupabase,
  appliquerModificationSupabase,
  corrigerPremierVersementSupabase,
  creerRecuSupabase,
  definirImageVersementSupabase,
  definirImagesPasseportSupabase,
  incrementerImpressionsSupabase,
  reserverNumeroSupabase,
} from './write'

export { dhVersCentimes, dhVersCentimesOuNull, centimesVersDh, centimesVersDhOuNull } from './dh'
export {
  natureDepuisModePaiement,
  modePaiementDepuisNature,
  statutDepuisLifecycle,
  lifecycleDepuisStatut,
  modeRemboursementDepuisRoute,
  routeDepuisModeRemboursement,
} from './codes'
export { isoVersDateFr, isoVersHeure, isoVersHorodatage, dateSqlVersDateFr } from './dates'
export { mapReceiptDetailToRecu, mapReusableOperationToOperationPartagee } from './mappers'
export {
  listerRecus,
  listerRecusLeger,
  recuParId,
  recuParNumero,
  listerOperationsPartageesReutilisables,
  listerAnomaliesBase,
  listerVersementsSaison,
  listerModificationsSaison,
  type AnomalieBase,
} from './read'

const recusSupabase: RecusPort = {
  lister: listerRecus,
  listerLeger: listerRecusLeger,
  parId: recuParId,
  parNumero: recuParNumero,
  reserverNumero: reserverNumeroSupabase,
  creer: creerRecuSupabase,
  ajouterVersement: ajouterVersementSupabase,
  appliquerModification: appliquerModificationSupabase,
  corrigerPremierVersement: corrigerPremierVersementSupabase,
  annuler: annulerRecuSupabase,
  incrementerImpressions: incrementerImpressionsSupabase,
  definirImageVersement: definirImageVersementSupabase,
  definirImagesPasseport: definirImagesPasseportSupabase,
}

/** Implémentation complète de `SourceDonnees` branchée sur le projet officiel omra. */
export const sourceSupabase: SourceDonnees = {
  referentiels: referentielsSupabase,
  session: sessionSupabase,
  recus: recusSupabase,
  clients: clientsSupabase,
  operationsPartagees: operationsPartageesSupabase,
  mouvementsCaisse: mouvementsCaisseSupabase,
  impressionsFinance: impressionsFinanceSupabase,
  acquittementsAnomalie: acquittementsAnomalieSupabase,
  versementsSaison: { lister: listerVersementsSaison },
  modificationsSaison: { lister: listerModificationsSaison },
  audit: journalAuditSupabase,
  fichiers: stockageSupabase,
  lecteurPasseport: lecteurPasseportSupabase,
  horloge,
  identifiants,
}
