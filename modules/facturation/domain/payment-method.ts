/**
 * Nature des paiements et identité des opérations partagées.
 *
 * Couvre : U-12, U-13.
 */

import { NATURE_CHEQUE, NATURE_ESPECES, NATURE_VIREMENT } from './constants'

/** Nature normalisée d'un paiement. */
export type NaturePaiement =
  | typeof NATURE_ESPECES
  | typeof NATURE_CHEQUE
  | typeof NATURE_VIREMENT

/** Code couleur utilisé par les tableaux et badges. Prototype : `receiptMethodColorClass`. */
export type CodeCouleurNature = 'cash' | 'cheque' | 'transfer' | 'none'

/**
 * U-12 — Normalise une nature de paiement quelle que soit son écriture d'origine.
 *
 * Reproduit `receiptMethodLabel()`. Le prototype accepte indifféremment les
 * variantes françaises, anglaises et arabes, car les données de démonstration et
 * les saisies successives n'ont pas toujours la même graphie. Une valeur non
 * reconnue est renvoyée telle quelle — comportement conservé.
 */
export function natureNormalisee(valeur: unknown): string {
  const brut = String(valeur ?? '').toLowerCase()
  if (brut === 'cash' || brut.includes('esp') || brut.includes(NATURE_ESPECES)) return NATURE_ESPECES
  if (
    brut === 'cheque' ||
    brut.includes('chèque') ||
    brut.includes('cheque') ||
    brut.includes(NATURE_CHEQUE)
  ) {
    return NATURE_CHEQUE
  }
  if (brut === 'transfer' || brut.includes('virement') || brut.includes('تحويل')) {
    return NATURE_VIREMENT
  }
  return String(valeur ?? '')
}

/**
 * U-12 — Libellé abrégé affiché dans les tableaux.
 * Reproduit `receiptMethodDisplay()` : le virement est raccourci.
 */
export function natureAbregee(valeur: unknown): string {
  const nature = natureNormalisee(valeur)
  return nature === NATURE_VIREMENT ? 'تحويل' : nature
}

/**
 * U-12 — Code couleur associé à une nature.
 * Reproduit `receiptMethodColorClass()`.
 */
export function codeCouleurNature(valeur: unknown): CodeCouleurNature {
  const nature = natureNormalisee(valeur)
  if (nature === NATURE_ESPECES) return 'cash'
  if (nature === NATURE_CHEQUE) return 'cheque'
  if (nature === NATURE_VIREMENT) return 'transfer'
  return 'none'
}

/**
 * Vrai si la nature suppose un instrument bancaire (chèque ou virement).
 * Prototype : `isBankInstrument()`.
 */
export function estInstrumentBancaire(valeur: unknown): boolean {
  const nature = natureNormalisee(valeur)
  return nature === NATURE_CHEQUE || nature === NATURE_VIREMENT
}

/** Libellé français de l'instrument. Prototype : `instrumentFrench()`. */
export function instrumentEnFrancais(valeur: unknown): 'Chèque' | 'Virement' {
  return natureNormalisee(valeur) === NATURE_VIREMENT ? 'Virement' : 'Chèque'
}

/** Libellé arabe de l'instrument. Prototype : `instrumentArabic()`. */
export function instrumentEnArabe(valeur: unknown): string {
  return natureNormalisee(valeur) === NATURE_VIREMENT ? 'التحويل' : 'الشيك'
}

/**
 * U-13 — Identité dérivée d'une opération partagée.
 *
 * Reproduit `sharedChequeId()` : banque, numéro et date, en minuscules, espaces
 * normalisés. Cette identité sert à regrouper les versements issus d'un même
 * chèque ou virement.
 *
 * Observation O-04 (documentée, non corrigée) : deux instruments réellement
 * distincts partageant banque + numéro + date seraient fusionnés. Le
 * comportement du fichier de référence est conservé tel quel.
 */
export function identiteOperationPartagee(
  numero: unknown,
  date: unknown,
  banque: unknown,
): string {
  const nettoyer = (valeur: unknown) =>
    String(valeur ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
  return `shared|${nettoyer(banque)}|${nettoyer(numero)}|${nettoyer(date)}`
}
