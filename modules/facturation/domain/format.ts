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
 * Séparateurs de présentation tolérés dans un téléphone saisi : espace, tiret,
 * point, parenthèses. Tout le reste (lettre ou symbole) est un contenu, pas
 * une mise en forme — jamais retiré en silence.
 */
const SEPARATEURS_TELEPHONE = /[\s.\-()]/g

/**
 * Normalise un téléphone saisi vers les 10 chiffres bruts, seul format
 * désormais stocké en base — l'affichage reformate à la lecture
 * (`formaterTelephone`), jamais la colonne elle-même. Même règle, à la
 * lettre, quel que soit l'écran appelant :
 *
 *  - les séparateurs de présentation (espace, tiret, point, parenthèses)
 *    sont retirés, sous n'importe quelle disposition — `0612 34 56 78`,
 *    `0612.34.56.78` et `0612345678` sont le même numéro ;
 *  - toute autre lettre ou symbole restant après ce nettoyage invalide la
 *    saisie entière (`null`) — jamais retiré en silence, une faute de frappe
 *    ne doit jamais devenir un numéro valide sans que personne s'en aperçoive ;
 *  - le résultat doit faire exactement 10 chiffres (R-02) ; un numéro
 *    international (`+212...`) n'est pas traité pour l'instant et échoue
 *    donc cette règle comme n'importe quelle autre saisie invalide.
 *
 * Unique fonction de validation/normalisation du téléphone : la création et
 * la modification d'un reçu l'appellent toutes les deux, pour ne plus jamais
 * diverger l'une de l'autre.
 */
export function telephoneNormalise(saisie: string): string | null {
  const nettoye = saisie.trim().replace(SEPARATEURS_TELEPHONE, '')
  return /^[0-9]{10}$/.test(nettoye) ? nettoye : null
}

/**
 * Recherche du registre par téléphone : numéro complet — brut ou mis en
 * forme, peu importe — ou au moins ses 6 derniers chiffres. En dessous de 6
 * chiffres, trop de faux positifs pour ~500 clients ; retourne `false`,
 * laissé à la recherche par nom.
 *
 * Une requête contenant autre chose que des chiffres et des séparateurs de
 * présentation n'est pas une recherche téléphone (`false`) : ni erreur, ni
 * correspondance approximative, elle retombe simplement sur le nom.
 *
 * N'écarte jamais plusieurs correspondances au profit d'une seule : c'est un
 * prédicat de filtre, à appliquer sur toute la liste — jamais un choix
 * silencieux du premier résultat.
 */
export function telephoneCorrespondRecherche(telephoneAffiche: string, requete: string): boolean {
  const chiffresRequete = requete.replace(SEPARATEURS_TELEPHONE, '')
  if (chiffresRequete.length < 6 || !/^[0-9]+$/.test(chiffresRequete)) return false
  const chiffresStockes = telephoneAffiche.replace(/\D/g, '')
  return chiffresStockes.endsWith(chiffresRequete)
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
