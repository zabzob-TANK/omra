/**
 * Conversion des dates entre la base (ISO 8601 `timestamptz`/`date`) et le
 * domaine (texte français `jj/mm/aaaa`, heure `HH:MM`, horodatage complet).
 *
 * Le domaine (`domain/dates.ts`) ne sait pas lire l'ISO 8601 : ses fonctions
 * d'extraction attendent déjà un horodatage au format français. Cette
 * conversion technique vit donc ici, dans l'adaptateur, jamais dans le
 * domaine.
 *
 * Le fuseau est fixé explicitement à `Africa/Casablanca` : le serveur qui
 * exécute cet adaptateur peut tourner en UTC (Vercel), et un formatage sans
 * fuseau explicite dépendrait silencieusement de l'environnement.
 */

const FUSEAU = 'Africa/Casablanca'

function partiesDate(iso: string): { jour: string; mois: string; annee: string } {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Horodatage invalide reçu de la base : ${JSON.stringify(iso)}`)
  }
  const formateur = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const parties = formateur.formatToParts(date)
  const valeur = (type: string) => parties.find((p) => p.type === type)?.value ?? ''
  return { jour: valeur('day'), mois: valeur('month'), annee: valeur('year') }
}

function partiesHeure(iso: string): { heure: string; minute: string } {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Horodatage invalide reçu de la base : ${JSON.stringify(iso)}`)
  }
  const formateur = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parties = formateur.formatToParts(date)
  const valeur = (type: string) => parties.find((p) => p.type === type)?.value ?? ''
  return { heure: valeur('hour'), minute: valeur('minute') }
}

/** Convertit un `timestamptz` ISO 8601 en date française `jj/mm/aaaa`. */
export function isoVersDateFr(iso: string): string {
  const { jour, mois, annee } = partiesDate(iso)
  return `${jour}/${mois}/${annee}`
}

/** Convertit un `timestamptz` ISO 8601 en heure `HH:MM` (fuseau Africa/Casablanca). */
export function isoVersHeure(iso: string): string {
  const { heure, minute } = partiesHeure(iso)
  return `${heure}:${minute}`
}

/** Convertit un `timestamptz` ISO 8601 en horodatage complet `jj/mm/aaaa HH:MM`. */
export function isoVersHorodatage(iso: string): string {
  return `${isoVersDateFr(iso)} ${isoVersHeure(iso)}`
}

/**
 * Convertit une colonne `date` (sans heure) au format `aaaa-mm-jj` en date
 * française `jj/mm/aaaa`. Utilisée pour `instrument_date`, qui n'a pas de
 * composante horaire ni de fuseau.
 */
export function dateSqlVersDateFr(dateSql: string): string {
  const trouve = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateSql)
  if (!trouve) {
    throw new Error(`Date SQL invalide reçue de la base : ${JSON.stringify(dateSql)}`)
  }
  const [, annee, mois, jour] = trouve
  return `${jour}/${mois}/${annee}`
}
