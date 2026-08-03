/**
 * Primitives bidirectionnelles — règles de direction du texte.
 *
 * L'interface générale est en **français, de gauche à droite**. Deux catégories
 * de valeurs échappent à cette direction et doivent être isolées :
 *
 *  - **valeurs arabes** (nom, prénom, hôtel, vol, rabatteur, motif, note) :
 *    lues de droite à gauche ;
 *  - **valeurs techniques** (montants, dates, téléphones, numéros de reçu,
 *    références bancaires) : lues de gauche à droite, même à l'intérieur d'un
 *    texte arabe.
 *
 * `unicode-bidi: plaintext` laisse le navigateur déduire la direction du premier
 * caractère fort, ce qui est le bon comportement pour un champ dont le contenu
 * peut être arabe ou latin. `unicode-bidi: isolate` force l'isolation d'un
 * fragment dont on connaît déjà la direction.
 *
 * Le fichier de référence obtient le même résultat avec les classes
 * `.money-ltr`, `.mono-ltr`, `.rtl` et `.ltr`, ainsi qu'avec les marques
 * Unicode U+2066 / U+2069 posées par `dhs()`.
 */

/** Catégories de valeurs reconnues par le module. */
export type CategorieValeur =
  /** Texte arabe : nom, prénom, hôtel, vol, rabatteur, motif, note. */
  | 'arabe'
  /** Montant en dirhams. */
  | 'montant'
  /** Date `jj/mm/aaaa` ou horodatage. */
  | 'date'
  /** Numéro de téléphone. */
  | 'telephone'
  /** Numéro de reçu, référence bancaire, identifiant technique. */
  | 'reference'
  /** Texte français courant. */
  | 'francais'

export interface AttributsDirection {
  dir: 'rtl' | 'ltr'
  style: { unicodeBidi: 'plaintext' | 'isolate'; direction: 'rtl' | 'ltr' }
}

const RTL_PLAINTEXT: AttributsDirection = {
  dir: 'rtl',
  style: { unicodeBidi: 'plaintext', direction: 'rtl' },
}

const LTR_ISOLATE: AttributsDirection = {
  dir: 'ltr',
  style: { unicodeBidi: 'isolate', direction: 'ltr' },
}

const LTR_PLAINTEXT: AttributsDirection = {
  dir: 'ltr',
  style: { unicodeBidi: 'plaintext', direction: 'ltr' },
}

/**
 * Attributs de direction à appliquer à une valeur selon sa catégorie.
 *
 * Les valeurs arabes sont en `plaintext` afin qu'un contenu accidentellement
 * latin (une note tapée en français, par exemple) reste lisible.
 */
export function attributsDirection(categorie: CategorieValeur): AttributsDirection {
  switch (categorie) {
    case 'arabe':
      return RTL_PLAINTEXT
    case 'montant':
    case 'date':
    case 'telephone':
    case 'reference':
      return LTR_ISOLATE
    case 'francais':
      return LTR_PLAINTEXT
  }
}

/** Plages Unicode arabes, identiques à celles du filtre de saisie `C-09`. */
const CARACTERE_ARABE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/

/**
 * Vrai si la chaîne contient au moins un caractère arabe.
 *
 * Sert à décider de la direction d'une valeur dont la catégorie n'est pas connue
 * à l'avance — par exemple une note libre. N'est jamais utilisé pour un champ
 * dont la catégorie est déjà déterminée par le modèle.
 */
export function contientArabe(valeur: string): boolean {
  return CARACTERE_ARABE.test(valeur)
}
