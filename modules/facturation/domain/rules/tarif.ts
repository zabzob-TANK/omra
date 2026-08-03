/**
 * Tarification et montant convenu.
 *
 * Couvre : R-05, R-06, R-07, R-08.
 */

import type { Tarif } from '../types'

/** Grille tarifaire prête à être interrogée. */
export interface GrilleTarifaire {
  /** Tarif en centimes, ou `null` si la combinaison n'est pas définie. */
  tarifPour(hotelId: string, volId: string, chambreId: string): number | null
}

/**
 * R-05 — Construit une grille interrogeable à partir des tarifs de la saison.
 *
 * Reproduit `getTarif()` : une combinaison incomplète ou absente renvoie `null`.
 * Un tarif à zéro est traité comme absent, exactement comme dans le fichier de
 * référence où le test `(g && g[c])` échoue sur une valeur nulle.
 */
export function construireGrille(tarifs: readonly Tarif[]): GrilleTarifaire {
  const index = new Map<string, number>()
  for (const tarif of tarifs) {
    index.set(`${tarif.hotelId}|${tarif.volId}|${tarif.chambreId}`, tarif.montantCentimes)
  }
  return {
    tarifPour(hotelId, volId, chambreId) {
      if (!hotelId || !volId || !chambreId) return null
      const trouve = index.get(`${hotelId}|${volId}|${chambreId}`)
      return trouve ? trouve : null
    },
  }
}

/**
 * R-06 — La réduction ne peut pas dépasser le plafond de la saison.
 * Reproduit `red > SAISON.reductionMax`.
 */
export function reductionDepasseLePlafond(
  reductionCentimes: number,
  plafondCentimes: number,
): boolean {
  return reductionCentimes > plafondCentimes
}

/**
 * R-07 — La réduction doit rester strictement inférieure au tarif.
 * Reproduit `red >= t` : l'égalité est refusée, pas seulement le dépassement.
 */
export function reductionAtteintLeTarif(reductionCentimes: number, tarifCentimes: number): boolean {
  return reductionCentimes >= tarifCentimes
}

/**
 * R-08 — Montant convenu = tarif − réduction.
 */
export function montantConvenu(tarifCentimes: number, reductionCentimes: number): number {
  return tarifCentimes - reductionCentimes
}
