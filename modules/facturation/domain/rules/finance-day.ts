/**
 * Journal financier — la caisse.
 *
 * Couvre : R-34, R-48, R-56 à R-67.
 *
 * Reproduit les calculs du fichier de référence : sélection de la période, tri,
 * totaux par nature, lignes d'annulation, impressions numérotées et détection
 * des anomalies apparues après une impression.
 *
 * Fonctions pures : aucune dépendance à React ni à la persistance.
 */

import { NATURE_CHEQUE, NATURE_ESPECES, NATURE_VIREMENT } from '../constants'
import { cleJour, cleJourDepuisDateFr, dateFrDepuisHorodatage, heureDepuisHorodatage } from '../dates'
import { natureNormalisee, identiteOperationPartagee } from '../payment-method'
import type {
  AcquittementAnomalie,
  ImpressionFinance,
  MouvementCaisse,
  Recu,
  Versement,
} from '../types'
import { totalPaye } from './receipt'

/** R-56 — Filtres proposés par le fichier de référence. */
export type FiltreFinance = 'day' | 'weekend' | 'custom' | 'all'

export interface PeriodeFinance {
  filtre: FiltreFinance
  /** Journée sélectionnée, format `aaaa-mm-jj`. */
  jour?: string
  /** Bornes du filtre personnalisé. */
  du?: string
  au?: string
}

/**
 * Identifiant d'un mouvement financier.
 * Reproduit `financeMovementId()` : l'identifiant du versement, ou un identifiant
 * dérivé lorsque le versement n'en porte pas.
 */
export function identifiantMouvement(recu: Recu, versement: Versement, index: number): string {
  return String(versement.id || `pay_${recu.id}_${index}`)
}

/** Ligne brute du journal, avant mise en forme. */
export interface MouvementFinance {
  id: string
  recu: Recu
  versement: Versement
  /** Rang du versement dans le reçu, à partir de 0. */
  index: number
  nature: string
  /** Clé de journée du versement. */
  jour: string
  heure: string
  /**
   * R-34 — Clé regroupant les versements issus d'une même opération bancaire.
   * Vide pour les espèces.
   */
  cleOperation: string
  triDateHeure: string
  sequence: number
}

/**
 * Rassemble tous les mouvements financiers de tous les reçus.
 * Reproduit la construction de `allFinanceRows`.
 */
export function collecterMouvements(recus: readonly Recu[]): MouvementFinance[] {
  const mouvements: MouvementFinance[] = []
  let sequence = 0

  for (const recu of recus) {
    recu.versements.forEach((versement, index) => {
      const nature = natureNormalisee(versement.nature)
      const dateDepuisHorodatage = dateFrDepuisHorodatage(versement.dateHeure)
      const jour = cleJourDepuisDateFr(versement.date || dateDepuisHorodatage)

      let heure = String(versement.heure || '').trim()
      if (!heure) heure = heureDepuisHorodatage(versement.dateHeure)
      if (!heure && index === 0) heure = heureDepuisHorodatage(recu.creeLe)

      // R-34 — un chèque ou un virement partagé porte la clé de son opération ;
      // un instrument unique reçoit une clé qui lui est propre.
      let cleOperation = ''
      if (nature === NATURE_CHEQUE || nature === NATURE_VIREMENT) {
        if (versement.portee === 'shared' || versement.montantOperationCentimes > 0) {
          cleOperation = String(
            versement.operationPartageeId ||
              identiteOperationPartagee(
                versement.referenceInstrument,
                versement.dateInstrument,
                versement.banque,
              ),
          )
        } else {
          cleOperation =
            (nature === NATURE_CHEQUE ? 'cheque|' : 'transfer|') +
            identifiantMouvement(recu, versement, index)
        }
      }

      mouvements.push({
        id: identifiantMouvement(recu, versement, index),
        recu,
        versement,
        index,
        nature,
        jour,
        heure: heure || '—',
        cleOperation,
        triDateHeure: `${jour || '0000-00-00'}T${heure || '00:00'}`,
        sequence: sequence++,
      })
    })
  }

  return mouvements
}

/** Bornes du week-end courant : samedi et dimanche. Reproduit le calcul du fichier. */
export function bornesWeekEnd(maintenant: Date): { debut: string; fin: string } {
  const debut = new Date(maintenant)
  const jourSemaine = debut.getDay()
  if (jourSemaine === 0) debut.setDate(debut.getDate() - 1)
  else if (jourSemaine !== 6) debut.setDate(debut.getDate() - (jourSemaine + 1))
  const fin = new Date(debut)
  fin.setDate(fin.getDate() + 1)
  return { debut: cleJour(debut), fin: cleJour(fin) }
}

/**
 * R-56 — Vrai si une journée appartient à la période sélectionnée.
 * Reproduit `inFinanceRange()`.
 */
export function dansLaPeriode(
  jour: string,
  periode: PeriodeFinance,
  maintenant: Date,
): boolean {
  if (!jour) return false
  const aujourdhui = cleJour(maintenant)

  if (periode.filtre === 'day') return jour === (periode.jour || aujourdhui)

  if (periode.filtre === 'weekend') {
    const { debut, fin } = bornesWeekEnd(maintenant)
    return jour >= debut && jour <= fin
  }

  if (periode.filtre === 'custom') {
    const a = periode.du || periode.au
    const b = periode.au || periode.du
    if (!a && !b) return false
    const bas = (a as string) <= (b as string) ? (a as string) : (b as string)
    const haut = (a as string) <= (b as string) ? (b as string) : (a as string)
    return jour >= bas && jour <= haut
  }

  return true
}

/**
 * Trie les mouvements comme le fichier de référence : du plus récent au plus
 * ancien, puis par identifiant décroissant, puis par ordre d'insertion inverse.
 */
export function trierMouvements(mouvements: MouvementFinance[]): MouvementFinance[] {
  const horodatageId = (id: string) => {
    const trouve = id.match(/(\d{10,})$/)
    return trouve ? Number(trouve[1]) : 0
  }
  return [...mouvements].sort((a, b) => {
    if (a.triDateHeure !== b.triDateHeure) return a.triDateHeure < b.triDateHeure ? 1 : -1
    const ia = horodatageId(a.id)
    const ib = horodatageId(b.id)
    if (ia !== ib) return ib - ia
    return b.sequence - a.sequence
  })
}

/**
 * R-58 — Code de mode affiché.
 * `E` espèces, `CH` chèque, `V` virement ; le suffixe `-P` marque une opération
 * partagée.
 */
export function codeMode(versement: Versement): string {
  const nature = natureNormalisee(versement.nature)
  if (nature === NATURE_ESPECES) return 'E'
  const partage = versement.portee === 'shared' || versement.montantOperationCentimes > 0
  if (nature === NATURE_VIREMENT) return partage ? 'V-P' : 'V'
  return partage ? 'CH-P' : 'CH'
}

/**
 * R-34 — Total réel d'un ensemble d'opérations bancaires.
 *
 * Reproduit `actualTotalFor()` : pour chaque opération, le montant retenu est le
 * plus grand montant d'opération déclaré, et non la somme des parts. Une
 * opération partagée ne compte donc qu'une fois, sans double comptage.
 */
export function totalReelOperations(mouvements: readonly MouvementFinance[]): number {
  const groupes = new Map<string, MouvementFinance[]>()
  for (const mouvement of mouvements) {
    const cle = mouvement.cleOperation || mouvement.id
    const groupe = groupes.get(cle)
    if (groupe) groupe.push(mouvement)
    else groupes.set(cle, [mouvement])
  }

  let total = 0
  for (const groupe of groupes.values()) {
    const distribue = groupe.reduce((somme, m) => somme + m.versement.montantCentimes, 0)
    const declares = groupe
      .map((m) => m.versement.montantOperationCentimes)
      .filter((montant) => montant > 0)
    total += declares.length ? Math.max(...declares) : distribue
  }
  return total
}

export interface TotauxFinance {
  /** Espèces encaissées, avant remboursements. */
  especesBrutCentimes: number
  /** R-48 — sorties réelles de caisse espèces. */
  remboursementsCentimes: number
  /** R-57 — espèces nettes des remboursements. */
  especesNettesCentimes: number
  chequesCentimes: number
  virementsCentimes: number
  /** Total général : espèces nettes + chèques + virements. */
  totalGeneralCentimes: number
  nombreOperationsCheque: number
  nombreOperationsVirement: number
  nombrePaiements: number
  nombreEspeces: number
  nombreRemboursements: number
}

/** R-34, R-48, R-57 — Totaux de la période. */
export function totauxFinance(
  mouvements: readonly MouvementFinance[],
  remboursements: readonly MouvementCaisse[],
): TotauxFinance {
  const parNature = (nature: string) => mouvements.filter((m) => m.nature === nature)

  const especes = parNature(NATURE_ESPECES)
  const especesBrutCentimes = especes.reduce((s, m) => s + m.versement.montantCentimes, 0)
  const remboursementsCentimes = remboursements.reduce((s, m) => s + m.montantCentimes, 0)
  const especesNettesCentimes = especesBrutCentimes - remboursementsCentimes

  const cheques = parNature(NATURE_CHEQUE)
  const virements = parNature(NATURE_VIREMENT)
  const chequesCentimes = totalReelOperations(cheques)
  const virementsCentimes = totalReelOperations(virements)

  const compterOperations = (liste: readonly MouvementFinance[]) =>
    new Set(liste.map((m) => m.cleOperation || m.id)).size

  return {
    especesBrutCentimes,
    remboursementsCentimes,
    especesNettesCentimes,
    chequesCentimes,
    virementsCentimes,
    totalGeneralCentimes: especesNettesCentimes + chequesCentimes + virementsCentimes,
    nombreOperationsCheque: compterOperations(cheques),
    nombreOperationsVirement: compterOperations(virements),
    nombrePaiements: mouvements.length,
    nombreEspeces: especes.length,
    nombreRemboursements: remboursements.length,
  }
}

/**
 * R-48 — Reçus annulés dans la période.
 * L'appartenance se juge sur la date d'annulation, pas sur la date du reçu.
 */
export function annulationsDeLaPeriode(
  recus: readonly Recu[],
  periode: PeriodeFinance,
  maintenant: Date,
): Recu[] {
  return recus.filter((recu) => {
    if (recu.statut !== 'ملغى') return false
    const date = dateFrDepuisHorodatage(recu.annuleLe)
    return dansLaPeriode(cleJourDepuisDateFr(date), periode, maintenant)
  })
}

/**
 * R-48 — Montant total annulé, tous modes de paiement confondus.
 *
 * Observation O-06 : le fichier de référence emploie ici le total payé, alors
 * que le suivi journalier utilise le montant remboursé. Les deux formules sont
 * conservées telles quelles, chacune à sa place.
 */
export function totalAnnuleCentimes(annulations: readonly Recu[]): number {
  return annulations.reduce((somme, recu) => somme + totalPaye(recu), 0)
}

/**
 * R-59 — Badge de la colonne « الدفعة » : `N` pour un premier versement,
 * sinon le rang du versement.
 */
export function badgeVersement(index: number): string {
  return index === 0 ? 'N' : String(index + 1)
}

/**
 * R-63 — Mouvements susceptibles d'être des anomalies.
 *
 * Reproduit `financeAnomalyCandidateIds()` :
 *  - tout mouvement apparu entre deux impressions successives ;
 *  - tout mouvement présent aujourd'hui mais absent de la dernière impression.
 *
 * R-64 — Sans aucune impression pour la journée, il n'y a pas d'anomalie.
 */
export function anomaliesCandidates(
  impressionsDuJour: readonly ImpressionFinance[],
  mouvementsActuels: readonly string[],
): string[] {
  const impressions = [...impressionsDuJour].sort(
    (a, b) =>
      a.numeroImpression - b.numeroImpression || String(a.imprimeLe).localeCompare(String(b.imprimeLe)),
  )
  if (!impressions.length) return []

  const candidats = new Set<string>()

  for (let index = 1; index < impressions.length; index += 1) {
    const precedente = new Set(impressions[index - 1].mouvementIds)
    for (const id of impressions[index].mouvementIds) {
      if (!precedente.has(id)) candidats.add(String(id))
    }
  }

  const derniere = new Set(impressions[impressions.length - 1].mouvementIds)
  for (const id of mouvementsActuels) {
    if (!derniere.has(id)) candidats.add(String(id))
  }

  return [...candidats].sort()
}

/** R-65 — Anomalies non encore acquittées. */
export function anomaliesEnAttente(
  candidates: readonly string[],
  acquittement: AcquittementAnomalie | null,
): string[] {
  const acquittees = new Set((acquittement?.mouvementIds ?? []).map(String))
  return candidates.filter((id) => !acquittees.has(String(id)))
}

/**
 * R-61 — Droit d'imprimer.
 *
 * Un employé ne peut imprimer que la journée courante ou la veille ;
 * l'administrateur n'a pas de limite. Une période autre qu'une journée unique
 * ne peut pas être imprimée.
 */
export function peutImprimer(options: {
  jour: string | null
  aujourdhui: string
  hier: string
  estAdministrateur: boolean
}): boolean {
  if (!options.jour) return false
  if (options.estAdministrateur) return true
  return options.jour === options.aujourdhui || options.jour === options.hier
}

/** R-67 — Nombre de lignes par page imprimée. Valeur du fichier de référence. */
export const LIGNES_PAR_PAGE_IMPRIMEE = 31

/** R-67 — Nombre de pages qu'occupera l'impression. */
export function nombreDePages(nombreDeLignes: number): number {
  return Math.max(1, Math.ceil(nombreDeLignes / LIGNES_PAR_PAGE_IMPRIMEE))
}

/**
 * R-66 — État de la veille : « ✓ » si elle ne porte aucune anomalie en attente,
 * « ? » sinon.
 */
export function etatVeille(anomaliesVeille: readonly string[]): '✓' | '?' {
  return anomaliesVeille.length ? '?' : '✓'
}

/**
 * R-62 — Code d'impression affiché : numéro de l'impression du jour sur deux
 * chiffres, précédé d'un symbole lorsqu'il y a eu plusieurs impressions.
 */
export function codeImpression(nombreImpressions: number): string {
  const code = String(nombreImpressions || 1).padStart(2, '0')
  if (!nombreImpressions) return ''
  return nombreImpressions > 1 ? `⧉ ${code}` : code
}

/**
 * R-62 — Code repris dans le bandeau supérieur de l'impression.
 *
 * Le fichier de référence y met `printCode`, c'est-à-dire toujours deux
 * chiffres, sans le symbole de duplication et sans jamais être vide : une
 * journée encore jamais imprimée y affiche `01`.
 */
export function codeImpressionBandeau(nombreImpressions: number): string {
  return String(nombreImpressions || 1).padStart(2, '0')
}

/**
 * R-67 — Codes qui perdent leur cadre à l'impression (`print-no-box` dans le
 * fichier de référence).
 *
 * Le fichier ne l'applique qu'à trois endroits, et jamais de façon générale :
 *  - le badge de versement, sauf le premier versement (`N`) ;
 *  - le code de méthode lorsqu'il vaut exactement `E` ;
 *  - le point d'état `•`, mais pas la coche `✓`.
 *
 * Les autres codes — `N`, `CH`, `V`, `CH-P`, `V-P`, `✓` et les `×` du tableau
 * des annulations — restent encadrés.
 */
export function badgeSansCadreALImpression(
  genre: 'versement' | 'mode' | 'statut',
  valeur: string,
): boolean {
  if (genre === 'versement') return valeur !== 'N'
  if (genre === 'mode') return valeur === 'E'
  return valeur === '•'
}

/**
 * Symbole et couleur de l'état d'impression, repris du fichier :
 * « ? » ambre en cas d'anomalie, « ✓ » vert pour la journée courante,
 * « ● » bleu sinon.
 */
export function etatImpression(options: {
  anomalieEnAttente: boolean
  estAujourdhui: boolean
}): { symbole: string; couleur: string } {
  if (options.anomalieEnAttente) return { symbole: '?', couleur: '#D6A300' }
  if (options.estAujourdhui) return { symbole: '✓', couleur: '#45D600' }
  return { symbole: '●', couleur: '#2E78B7' }
}
