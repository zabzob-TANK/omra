/**
 * Arithmétique et affichage des montants.
 *
 * Couvre : U-01, U-02.
 *
 * Tous les montants du système sont des **entiers en centimes**, comme dans le
 * fichier de référence. Aucun flottant ne circule dans le domaine.
 */

/** Marque Unicode d'ouverture d'isolat directionnel gauche-à-droite (U+2066). */
const ISOLAT_LTR = '\u2066'
/** Marque Unicode de fermeture d'isolat directionnel (U+2069). */
const FIN_ISOLAT = '\u2069'
/** Espace fine insécable (U+202F) et espace insécable (U+00A0). */
const ESPACES_INSECABLES = /\u202f|\u00a0/g

/**
 * U-01 — Formate un montant en centimes pour l'affichage.
 *
 * Reproduit exactement `dh()` du prototype :
 * division par 100, formatage `fr-FR`, puis normalisation des espaces
 * insécables (U+202F espace fine, U+00A0 espace insécable) en espace simple.
 *
 * @example centimesEnTexte(3480000) === '34 800'
 * @example centimesEnTexte(34850) === '348,5'
 */
export function centimesEnTexte(centimes: number): string {
  return (centimes / 100).toLocaleString('fr-FR').replace(ESPACES_INSECABLES, ' ')
}

/**
 * U-02 — Formate un montant en centimes avec sa devise, isolé en lecture
 * gauche-à-droite.
 *
 * Reproduit exactement `dhs()` du prototype. Les marques d'isolat garantissent
 * que le montant reste lisible de gauche à droite même lorsqu'il est inséré
 * dans une phrase arabe.
 *
 * @example centimesEnTexteDevise(3480000) === '\u2066' + '34 800 DH' + '\u2069'
 */
export function centimesEnTexteDevise(centimes: number): string {
  return ISOLAT_LTR + centimesEnTexte(centimes) + ' DH' + FIN_ISOLAT
}

/**
 * Retire les marques d'isolat d'une chaîne produite par `centimesEnTexteDevise`.
 * Utile pour les tests et les comparaisons ; jamais pour l'affichage.
 */
export function sansMarquesIsolat(texte: string): string {
  return texte.replace(/[\u2066\u2069]/g, '')
}

/**
 * Convertit une saisie utilisateur en dirhams (chiffres seuls) vers des centimes.
 *
 * Reproduit le calcul du prototype : `Math.max(0, (+valeur || 0)) * 100`.
 * Une saisie vide, négative ou non numérique donne 0.
 */
export function dirhamsSaisisEnCentimes(valeur: string | number): number {
  return Math.max(0, Number(valeur) || 0) * 100
}

/**
 * Convertit des centimes vers la valeur en dirhams affichée dans les champs de
 * saisie. Reproduit `String(Math.round(centimes / 100))` du prototype.
 */
export function centimesEnDirhamsSaisis(centimes: number): string {
  return String(Math.round(centimes / 100))
}
