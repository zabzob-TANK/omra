/**
 * Comportements d'interface issus du fichier de référence.
 *
 * Isolés ici en fonctions pures pour être testables sans navigateur : les
 * composants se contentent de les appeler.
 *
 * Couvre : R-87, R-88, R-89.
 */

/**
 * R-88 — Durée d'affichage d'une notification transitoire, en millisecondes.
 * Valeur du fichier de référence.
 */
export const DUREE_NOTIFICATION = 2800

/** Clé de la préférence d'affichage. Ce n'est pas une donnée métier. */
export const CLE_MODE_SOMBRE = 'omra-sombre'

/** Sous-ensemble de `Storage` réellement utilisé — facilite les tests. */
export interface StockagePreferences {
  getItem(cle: string): string | null
  setItem(cle: string, valeur: string): void
}

/**
 * R-87 — Lit la préférence de mode sombre.
 *
 * Le stockage local ne sert qu'à cette préférence d'affichage : les données
 * métier viennent exclusivement de la base, via les ports.
 * Un stockage indisponible ou en erreur ramène au mode clair.
 */
export function lireModeSombre(stockage: StockagePreferences | null | undefined): boolean {
  if (!stockage) return false
  try {
    return stockage.getItem(CLE_MODE_SOMBRE) === '1'
  } catch {
    return false
  }
}

/** R-87 — Enregistre la préférence de mode sombre, sans jamais échouer bruyamment. */
export function ecrireModeSombre(
  stockage: StockagePreferences | null | undefined,
  sombre: boolean,
): void {
  if (!stockage) return
  try {
    stockage.setItem(CLE_MODE_SOMBRE, sombre ? '1' : '0')
  } catch {
    // Ignoré volontairement : une préférence d'affichage ne doit rien interrompre.
  }
}

/**
 * R-89 — Vrai si la touche pressée doit fermer la fenêtre ouverte.
 * Le fichier de référence n'intercepte que `Escape`.
 */
export function fermeLaFenetre(touche: string): boolean {
  return touche === 'Escape'
}

/**
 * Store externe de la préférence de mode sombre.
 *
 * Le mode sombre est un état extérieur à React — il vit dans le stockage du
 * navigateur. On l'expose donc comme une source externe abonnable, plutôt que
 * de le recopier dans un état React au montage.
 */
export interface StoreModeSombre {
  subscribe(ecouteur: () => void): () => void
  /** Instantané courant, côté client. */
  lire(): boolean
  /** Instantané servi au rendu serveur : toujours le mode clair. */
  lireServeur(): boolean
  basculer(): void
}

export function creerStoreModeSombre(
  stockage: StockagePreferences | null | undefined,
): StoreModeSombre {
  const ecouteurs = new Set<() => void>()
  let valeur = lireModeSombre(stockage)

  return {
    subscribe(ecouteur) {
      ecouteurs.add(ecouteur)
      return () => ecouteurs.delete(ecouteur)
    },
    lire: () => valeur,
    lireServeur: () => false,
    basculer() {
      valeur = !valeur
      ecrireModeSombre(stockage, valeur)
      ecouteurs.forEach((ecouteur) => ecouteur())
    },
  }
}
