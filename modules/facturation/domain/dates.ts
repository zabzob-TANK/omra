/**
 * Dates et heures.
 *
 * Couvre : U-03, U-04, U-07.
 *
 * Deux représentations coexistent dans le fichier de référence, et toutes deux
 * sont conservées :
 *  - **texte français** `jj/mm/aaaa` — c'est ce qui est stocké sur les versements
 *    et les reçus, et ce qui est affiché ;
 *  - **clé de journée** `aaaa-mm-jj` — utilisée pour regrouper, filtrer et trier.
 *
 * Toutes les fonctions dépendant de l'instant présent acceptent une date
 * explicite. Le comportement par défaut est identique au prototype ; le
 * paramètre n'existe que pour rendre les tests déterministes.
 */

/** Date française `jj/mm/aaaa`. Prototype : `r.date`, `v.date`. */
export type DateFr = string

/** Clé de journée `aaaa-mm-jj`. Prototype : `dayKey`. */
export type CleJour = string

/**
 * U-03 — Date du jour au format français.
 * Prototype : `today()`.
 */
export function dateDuJour(maintenant: Date = new Date()): DateFr {
  return maintenant.toLocaleDateString('fr-FR')
}

/**
 * U-03 — Heure courante `HH:MM`.
 * Prototype : `nowTime()`.
 */
export function heureCourante(maintenant: Date = new Date()): string {
  return maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * U-03 — Horodatage complet `jj/mm/aaaa HH:MM`.
 * Prototype : `nowStr()`.
 */
export function horodatage(maintenant: Date = new Date()): string {
  return maintenant.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * U-04 — Clé de journée d'un objet `Date`.
 * Prototype : `dateKey()`.
 */
export function cleJour(date: Date): CleJour {
  const annee = date.getFullYear()
  const mois = String(date.getMonth() + 1).padStart(2, '0')
  const jour = String(date.getDate()).padStart(2, '0')
  return `${annee}-${mois}-${jour}`
}

/**
 * U-04 — Convertit une date française en clé de journée.
 * Renvoie la chaîne vide si le format n'est pas exactement `jj/mm/aaaa`.
 * Prototype : `frDateKey()`.
 */
export function cleJourDepuisDateFr(valeur: string | null | undefined): CleJour {
  const trouve = String(valeur ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return trouve ? `${trouve[3]}-${trouve[2]}-${trouve[1]}` : ''
}

/**
 * U-04 — Convertit une clé de journée en date française.
 * Renvoie le tiret cadratin si la clé est invalide, comme le prototype.
 * Prototype : `keyToFr()`.
 */
export function dateFrDepuisCleJour(valeur: string | null | undefined): string {
  const trouve = String(valeur ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return trouve ? `${trouve[3]}/${trouve[2]}/${trouve[1]}` : '—'
}

/**
 * U-07 — Valide une date française saisie.
 * Contrôle de forme uniquement : le prototype ne vérifie pas l'existence du jour.
 * Prototype : `okDate()`.
 */
export function dateFrValide(valeur: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(valeur)
}

/**
 * Extrait la partie date française d'un horodatage `jj/mm/aaaa HH:MM`.
 * Prototype : `String(r.annuleLe).match(/(\d{2}\/\d{2}\/\d{4})/)`.
 */
export function dateFrDepuisHorodatage(valeur: string | null | undefined): DateFr | '' {
  const trouve = String(valeur ?? '').match(/(\d{2}\/\d{2}\/\d{4})/)
  return trouve ? trouve[1] : ''
}

/**
 * Extrait la partie heure d'un horodatage `jj/mm/aaaa HH:MM`.
 * Renvoie la chaîne vide si l'heure est absente.
 */
export function heureDepuisHorodatage(valeur: string | null | undefined): string {
  const trouve = String(valeur ?? '').match(/(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/)
  return trouve && trouve[2] ? trouve[2] : ''
}

/** Décale une clé de journée d'un nombre de jours. Midi local pour éviter les sauts d'heure d'été. */
export function decalerCleJour(cle: CleJour, jours: number): CleJour {
  const base = new Date(`${cle}T12:00:00`)
  base.setDate(base.getDate() + jours)
  return cleJour(base)
}

/** Vrai si la clé de journée tombe un samedi ou un dimanche (R-71). */
export function estWeekEnd(cle: CleJour): boolean {
  const jour = new Date(`${cle}T12:00:00`).getDay()
  return jour === 0 || jour === 6
}
