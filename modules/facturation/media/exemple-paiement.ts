/**
 * Image d'exemple pour le justificatif de chèque ou de virement.
 *
 * Specimen fictif réel (JPG), servi depuis `public/facturation/exemples/` —
 * remplace l'ancienne vignette SVG générée côté client, qui n'était jamais
 * acceptée par le stockage réel (JPG/PNG/WebP uniquement, sécurité).
 *
 * Bouton « Utiliser un exemple » de la fenêtre d'ajout — visible uniquement
 * en démonstration (`ModalePaiementImage`, `modeDemonstration`).
 */

import { chargerImageExemple } from './charger-exemple'

const CHEMIN_EXEMPLE = '/facturation/exemples/cheque-specimen.jpg'

export function imageExemplePaiement(): Promise<Blob> {
  return chargerImageExemple(CHEMIN_EXEMPLE)
}

export const NOM_FICHIER_EXEMPLE = 'cheque-specimen.jpg'
