/**
 * Masques de saisie et nettoyage de champs.
 *
 * Couvre : U-08, U-09, U-10, U-11, U-14.
 *
 * Ces fonctions s'appliquent **à la frappe**, exactement comme dans le fichier
 * de référence : elles transforment la valeur pendant que l'utilisateur tape.
 */

import { CARACTERES_NON_ARABES } from './constants'

/**
 * U-08 — Masque du numéro de téléphone marocain.
 *
 * Reproduit `fmtTel()` : les non-chiffres sont retirés, un `0` initial est forcé,
 * la valeur est tronquée à 10 chiffres, puis présentée `0XXX-XX.XX.XX`.
 *
 * @example formaterTelephone('611007500') === '0611-00.75.00'
 */
export function formaterTelephone(valeur: string): string {
  let chiffres = valeur.replace(/\D/g, '')
  if (chiffres.length && chiffres[0] !== '0') chiffres = '0' + chiffres
  chiffres = chiffres.slice(0, 10)

  let sortie = chiffres.slice(0, 4)
  if (chiffres.length > 4) sortie += '-' + chiffres.slice(4, 6)
  if (chiffres.length > 6) sortie += '.' + chiffres.slice(6, 8)
  if (chiffres.length > 8) sortie += '.' + chiffres.slice(8, 10)
  return sortie
}

/** Nombre de chiffres significatifs d'un téléphone saisi. Règle R-02 : exactement 10. */
export function chiffresTelephone(valeur: string): number {
  return valeur.replace(/\D/g, '').length
}

/**
 * U-09 — Masque de date `jj/mm/aaaa`, appliqué progressivement à la frappe.
 * Reproduit `fmtDate()`.
 *
 * @example formaterDate('02072025') === '02/07/2025'
 */
export function formaterDate(valeur: string): string {
  const chiffres = valeur.replace(/\D/g, '').slice(0, 8)
  let sortie = chiffres.slice(0, 2)
  if (chiffres.length > 2) sortie += '/' + chiffres.slice(2, 4)
  if (chiffres.length > 4) sortie += '/' + chiffres.slice(4, 8)
  return sortie
}

/**
 * U-10 — Masque de montant : chiffres uniquement.
 * Reproduit `fmtMoney()`. La saisie se fait en dirhams entiers.
 */
export function formaterMontant(valeur: string): string {
  return valeur.replace(/\D/g, '')
}

/**
 * Affichage uniquement : groupe les milliers d'un montant en cours de saisie
 * par un espace (50000 -> 50 000), pour lire le champ plus facilement pendant
 * la frappe. La valeur stockée reste les chiffres purs de `formaterMontant` —
 * ceci ne change rien à la validation ni au calcul.
 */
export function formaterMontantAffiche(valeur: string): string {
  return formaterMontant(valeur).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/**
 * U-11 — Retire tout caractère non arabe.
 * Reproduit `cleanAr()`. Appliqué aux noms, prénoms et autres champs arabes.
 */
export function nettoyerArabe(valeur: string): string {
  return valeur.replace(CARACTERES_NON_ARABES, '')
}

/**
 * U-14 — Échappement HTML.
 *
 * Reproduit `esc()`. Nécessaire pour le gabarit du reçu imprimable (lot L3),
 * qui construit du HTML par substitution de marqueurs.
 */
export function echapperHtml(valeur: unknown): string {
  const table: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return String(valeur == null ? '' : valeur).replace(/[&<>"']/g, (c) => table[c])
}
