'use client'

/**
 * Indicateur visible d'opération en cours, posé dans les boutons de
 * soumission pendant leur écriture — un bouton simplement désactivé ne dit
 * pas à l'employé que l'application travaille, surtout sur un enregistrement
 * qui prend plusieurs secondes.
 */
export function IndicateurChargement() {
  return <span className="omra-spinner" aria-hidden="true" />
}
