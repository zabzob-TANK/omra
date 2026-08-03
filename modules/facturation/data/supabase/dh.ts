/**
 * Conversion des montants entre la base (dirhams entiers) et le domaine
 * (centimes entiers).
 *
 * Règle absolue : cette conversion ne vit nulle part ailleurs que dans
 * l'adaptateur Supabase. Le domaine ne connaît que des centimes ; la base ne
 * connaît que des dirhams entiers. Aucun arrondi n'est jamais toléré — un
 * montant qui ne tombe pas juste au dirham est un signe de corruption des
 * données et doit interrompre l'opération, pas être approximé.
 */

function estEntierFini(valeur: number): boolean {
  return typeof valeur === 'number' && Number.isFinite(valeur) && Number.isInteger(valeur)
}

/**
 * Convertit un montant en dirhams entiers (tel que stocké en base) vers des
 * centimes (tel qu'attendu par le domaine).
 *
 * Une multiplication par 100 d'un entier est toujours exacte : aucun arrondi
 * n'est possible dans ce sens. Seule la forme de la valeur lue est vérifiée.
 */
export function dhVersCentimes(dh: number): number {
  if (!estEntierFini(dh)) {
    throw new Error(`Montant en dirhams invalide : ${JSON.stringify(dh)} n'est pas un entier fini`)
  }
  return dh * 100
}

/** Variante nulle : `null`/`undefined` en base restent `null` dans le domaine. */
export function dhVersCentimesOuNull(dh: number | null | undefined): number | null {
  if (dh === null || dh === undefined) return null
  return dhVersCentimes(dh)
}

/**
 * Convertit des centimes (domaine) vers des dirhams entiers (base).
 *
 * Sens dangereux : si le montant ne tombe pas juste au dirham, ce n'est pas
 * arrondi — c'est une erreur. Un centime perdu ou gagné silencieusement est un
 * écart de caisse invisible.
 */
export function centimesVersDh(centimes: number): number {
  if (!estEntierFini(centimes)) {
    throw new Error(`Montant en centimes invalide : ${JSON.stringify(centimes)} n'est pas un entier fini`)
  }
  if (centimes % 100 !== 0) {
    throw new Error(
      `Montant en centimes non convertible en dirhams entiers sans perte : ${centimes} centimes (${centimes / 100} DH)`,
    )
  }
  return centimes / 100
}

/** Variante nulle : `null`/`undefined` dans le domaine restent `null` en base. */
export function centimesVersDhOuNull(centimes: number | null | undefined): number | null {
  if (centimes === null || centimes === undefined) return null
  return centimesVersDh(centimes)
}
