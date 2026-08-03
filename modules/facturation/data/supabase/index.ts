/**
 * Adaptateur Supabase — partie lecture uniquement (fusion.md §6, étape 5a).
 *
 * N'exporte pas encore d'implémentation de `SourceDonnees` ni de `RecusPort` /
 * `OperationsPartageesPort` complets : il manque les méthodes d'écriture, la
 * session, les référentiels et le stockage de fichiers. Voir le rapport de
 * portage pour ce qui reste à faire avant l'étape d'écriture.
 */
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
  recuParId,
  recuParNumero,
  listerOperationsPartageesReutilisables,
  listerAnomaliesBase,
  type AnomalieBase,
} from './read'
