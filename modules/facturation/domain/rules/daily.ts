/**
 * Suivi journalier — une ligne par journée du mois.
 *
 * Couvre : R-68 à R-72.
 *
 * Reproduit les calculs du fichier de référence : construction du mois,
 * définition d'une journée active, agrégats par journée, état de contrôle,
 * sélection multiple et périmètre de calcul.
 *
 * Fonctions pures : aucune dépendance à React ni à la persistance.
 */

import { NATURE_CHEQUE, NATURE_ESPECES, NATURE_VIREMENT, STATUT_ANNULE } from '../constants'
import { cleJour, cleJourDepuisDateFr, dateFrDepuisHorodatage } from '../dates'
import { natureNormalisee, identiteOperationPartagee } from '../payment-method'
import type {
  EvenementModificationSaison,
  ImpressionFinance,
  MouvementCaisse,
  OperationPartagee,
  Recu,
  RecuSaison,
  VersementSaison,
} from '../types'
import { identifiantMouvement } from './finance-day'

/** R-68 — Noms de jours du fichier, dimanche en tête. */
export const NOMS_JOURS = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
] as const

/** État de contrôle d'une journée. Libellés exacts du fichier. */
export type EtatControle =
  | 'Aucune opération'
  | 'Modifiée après impression'
  | 'Imprimée'
  | 'À imprimer'

export type ClasseControle = 'empty' | 'changed' | 'printed' | 'pending'

/** Agrégats d'une journée. Reproduit `dailySummaryFor()`. */
export interface ResumeJournee {
  cle: string
  /** Nombre de versements enregistrés ce jour-là, toutes natures confondues. */
  versements: number
  /** R-72 — Espèces nettes des remboursements de caisse. */
  especesCentimes: number
  nombreCheques: number
  chequesCentimes: number
  nombreVirements: number
  virementsCentimes: number
  nouveauxClients: number
  nombreAnnulations: number
  annulationsCentimes: number
  modifications: number
  /** Versements + annulations. */
  operations: number
  /** Numéro du dernier reçu créé ce jour-là. */
  dernierRecu: number | null
  /** R-69 — Vrai dès qu'une trace existe sur la journée. */
  active: boolean
  imprimee: boolean
  /** Nombre d'anomalies restées en attente après impression. */
  enAttente: number
}

/**
 * Dernier jour à présenter pour un mois donné.
 *
 * Le fichier s'arrête au jour courant lorsque le mois affiché est le mois en
 * cours, et va jusqu'au dernier jour du mois sinon.
 */
export function dernierJourAffiche(mois: string, maintenant: Date): number {
  const [annee, moisIndex] = decomposerMois(mois)
  const moisCourant = cleJour(maintenant).slice(0, 7)
  if (mois === moisCourant) return maintenant.getDate()
  return new Date(annee, moisIndex + 1, 0).getDate()
}

/** R-68 — Clés des journées du mois, de la plus récente à la plus ancienne. */
export function joursDuMois(mois: string, maintenant: Date): string[] {
  const [annee, moisIndex] = decomposerMois(mois)
  const dernier = dernierJourAffiche(mois, maintenant)
  const cles: string[] = []
  for (let jour = dernier; jour >= 1; jour -= 1) {
    cles.push(`${annee}-${String(moisIndex + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`)
  }
  return cles
}

/** Mois valide `aaaa-mm`, ou le mois courant. */
export function moisValide(valeur: string | null | undefined, maintenant: Date): string {
  return /^\d{4}-\d{2}$/.test(String(valeur ?? '')) ? String(valeur) : cleJour(maintenant).slice(0, 7)
}

function decomposerMois(mois: string): [number, number] {
  const parties = /^(\d{4})-(\d{2})$/.exec(mois)
  if (!parties) throw new Error(`Mois invalide : ${mois}`)
  return [Number(parties[1]), Number(parties[2]) - 1]
}

/**
 * Versement rattaché à sa journée, avec sa clé de regroupement bancaire.
 *
 * `recuId`/`versementId` remplacent `recu`/`index` (position dans
 * `recu.versements`, qui n'existe plus sous cette forme depuis la décision
 * de performance du 2026-08-09) — seul l'identifiant compte ici, jamais une
 * relecture du reçu complet.
 */
interface VersementDate {
  recuId: string
  versementId: string
  cle: string
  nature: string
  operationId: string
  operation: OperationPartagee | null
  cleBancaire: string
  montantCentimes: number
  montantOperationCentimes: number
}

/**
 * R-72 — Journée retenue pour une opération partagée : celle de sa création,
 * et non celle du versement. Reproduit `dailyOperationCreatedKey()`.
 */
function cleCreationOperation(operation: OperationPartagee | null): string {
  if (!operation) return ''
  const brut = String(operation.creeeLe || '')
  const fr = /(\d{2}\/\d{2}\/\d{4})/.exec(brut)
  if (fr) return cleJourDepuisDateFr(fr[1])
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(brut)
  return iso ? iso[1] : ''
}

/**
 * Reproduit la construction de `VersementDate` — depuis
 * `list_billing_season_payments` (à plat), jamais depuis des `Recu` complets
 * (décision de performance du 2026-08-09).
 */
function collecterVersements(
  versementsSaison: readonly VersementSaison[],
  operations: readonly OperationPartagee[],
): VersementDate[] {
  const parId = new Map(operations.map((o) => [String(o.id), o]))
  return versementsSaison.map(({ recu, versement }) => {
    const nature = natureNormalisee(versement.nature)
    const operationId = String(versement.operationPartageeId || '')
    const operation = operationId ? (parId.get(operationId) ?? null) : null
    const estBancaire = nature === NATURE_CHEQUE || nature === NATURE_VIREMENT
    const cleBancaire = estBancaire
      ? operationId ||
        (nature === NATURE_CHEQUE ? 'CH|' : 'TR|') +
          identifiantMouvement(recu.id, versement, versement.rang - 1)
      : ''
    return {
      recuId: recu.id,
      versementId: versement.id,
      cle: cleJourDepuisDateFr(versement.date),
      nature,
      operationId,
      operation,
      cleBancaire,
      montantCentimes: versement.montantCentimes,
      montantOperationCentimes: versement.montantOperationCentimes,
    }
  })
}

/**
 * R-72 — Groupes d'instruments d'une journée pour une nature donnée.
 * Reproduit `dailyInstrumentGroupsFor()`.
 */
function groupesInstrument(
  versements: readonly VersementDate[],
  cle: string,
  nature: string,
): Map<string, VersementDate[]> {
  const groupes = new Map<string, VersementDate[]>()
  for (const versement of versements) {
    if (versement.nature !== nature) continue
    let cleCreation = versement.cle
    if (versement.operationId && versement.operation) {
      cleCreation = cleCreationOperation(versement.operation) || versement.cle
    }
    if (cleCreation !== cle) continue
    const groupe =
      versement.cleBancaire ||
      identifiantMouvement(versement.recuId, { id: versement.versementId }, 0)
    const existant = groupes.get(groupe)
    if (existant) existant.push(versement)
    else groupes.set(groupe, [versement])
  }
  return groupes
}

/**
 * R-34, R-72 — Total réel d'un ensemble de groupes : le plus grand montant
 * déclaré du groupe s'il existe, sinon la somme répartie.
 * Reproduit `dailyActualTotalFor()`.
 */
function totalReelGroupes(groupes: Map<string, VersementDate[]>): number {
  let total = 0
  for (const groupe of groupes.values()) {
    const reparti = groupe.reduce((somme, v) => somme + v.montantCentimes, 0)
    const declares = groupe
      .map((v) => (v.operation ? v.operation.montantTotalCentimes : v.montantOperationCentimes))
      .filter((valeur) => !!valeur)
    total += declares.length ? Math.max(...declares) : reparti
  }
  return total
}

export interface SourceJournees {
  /** Reçus allégés de la saison — jamais des `Recu` complets (voir `RecuSaison`). */
  recusSaison: readonly RecuSaison[]
  versementsSaison: readonly VersementSaison[]
  modificationsSaison: readonly EvenementModificationSaison[]
  operations: readonly OperationPartagee[]
  mouvementsCaisse: readonly MouvementCaisse[]
  impressions: readonly ImpressionFinance[]
  /** Anomalies restées en attente, par journée. */
  anomaliesEnAttente: (cle: string) => number
}

/** R-69, R-72 — Agrégats d'une journée. Reproduit `dailySummaryFor()`. */
export function resumeJournee(cle: string, source: SourceJournees): ResumeJournee {
  const versements = collecterVersements(source.versementsSaison, source.operations)
  return resumeJourneeAvecVersements(cle, source, versements)
}

function resumeJourneeAvecVersements(
  cle: string,
  source: SourceJournees,
  versements: readonly VersementDate[],
): ResumeJournee {
  const duJour = versements.filter((v) => v.cle === cle)
  const mouvements = source.mouvementsCaisse.filter((m) => m.jour === cle)

  const especesBrut = duJour
    .filter((v) => v.nature === NATURE_ESPECES)
    .reduce((somme, v) => somme + v.montantCentimes, 0)
  const remboursements = mouvements
    .filter((m) => m.type === 'refund_cash')
    .reduce((somme, m) => somme + m.montantCentimes, 0)

  const cheques = groupesInstrument(versements, cle, NATURE_CHEQUE)
  const virements = groupesInstrument(versements, cle, NATURE_VIREMENT)

  const nouveaux = source.recusSaison.filter((r) => cleJourDepuisDateFr(r.date) === cle)
  const annulations = source.recusSaison.filter((r) => {
    if (r.statut !== STATUT_ANNULE) return false
    const date = dateFrDepuisHorodatage(r.annuleLe)
    return !!date && cleJourDepuisDateFr(date) === cle
  })

  // O-06 — le suivi journalier retient le montant remboursé s'il existe, et le
  // total payé sinon. Le journal financier, lui, retient toujours le total
  // payé. L'écart est conservé tel quel. Le remboursement est cherché dans
  // les mouvements de caisse déjà chargés pour ce jour (`mouvements`,
  // ci-dessus) par numéro de reçu — jamais un champ `Recu` complet.
  const annulationsCentimes = annulations.reduce((somme, r) => {
    const remboursement = mouvements.find(
      (m) => m.type === 'refund_cash' && m.recuNumero === r.numero,
    )
    return somme + (remboursement?.montantCentimes || r.totalPayeCentimes || 0)
  }, 0)

  const modifications = source.modificationsSaison.filter((m) => {
    const date = dateFrDepuisHorodatage(m.survenuLe)
    return !!date && cleJourDepuisDateFr(date) === cle
  }).length

  const impressions = source.impressions.filter((p) => p.jour === cle)
  const enAttente = impressions.length ? source.anomaliesEnAttente(cle) : 0

  // R-69 — une journée est active dès qu'elle porte une trace, quelle qu'elle soit.
  const active =
    duJour.length > 0 ||
    nouveaux.length > 0 ||
    annulations.length > 0 ||
    modifications > 0 ||
    impressions.length > 0 ||
    mouvements.length > 0

  return {
    cle,
    versements: duJour.length,
    especesCentimes: especesBrut - remboursements,
    nombreCheques: cheques.size,
    chequesCentimes: totalReelGroupes(cheques),
    nombreVirements: virements.size,
    virementsCentimes: totalReelGroupes(virements),
    nouveauxClients: nouveaux.length,
    nombreAnnulations: annulations.length,
    annulationsCentimes,
    modifications,
    operations: duJour.length + annulations.length,
    dernierRecu: nouveaux.length ? Math.max(...nouveaux.map((r) => r.numero)) : null,
    active,
    imprimee: impressions.length > 0,
    enAttente,
  }
}

/** R-68 — Résumés du mois, du jour le plus récent au plus ancien. */
export function resumesDuMois(
  mois: string,
  maintenant: Date,
  source: SourceJournees,
): ResumeJournee[] {
  const versements = collecterVersements(source.versementsSaison, source.operations)
  return joursDuMois(mois, maintenant).map((cle) =>
    resumeJourneeAvecVersements(cle, source, versements),
  )
}

/** R-72 — État de contrôle d'une journée. Libellés et priorité du fichier. */
export function etatControle(resume: ResumeJournee): {
  etat: EtatControle
  classe: ClasseControle
  prefixe: string
} {
  if (!resume.active) return { etat: 'Aucune opération', classe: 'empty', prefixe: '' }

  const prefixe =
    (resume.dernierRecu ? `R${resume.dernierRecu} · ` : '') +
    `Op${resume.operations} · P${resume.versements} · M${resume.modifications} ·`

  if (resume.imprimee && resume.enAttente) {
    return { etat: 'Modifiée après impression', classe: 'changed', prefixe }
  }
  if (resume.imprimee) return { etat: 'Imprimée', classe: 'printed', prefixe }
  return { etat: 'À imprimer', classe: 'pending', prefixe }
}

/**
 * R-70 — Périmètre de calcul : les journées sélectionnées si la sélection n'est
 * pas vide, le mois entier sinon.
 */
export function perimetreDeCalcul(
  resumes: readonly ResumeJournee[],
  selection: ReadonlySet<string>,
): ResumeJournee[] {
  const selectionnees = resumes.filter((r) => selection.has(r.cle))
  return selectionnees.length ? selectionnees : [...resumes]
}

/** R-70 — Journées affichées : toutes, ou seulement les actives. */
export function journeesVisibles(
  resumes: readonly ResumeJournee[],
  afficherVides: boolean,
): ResumeJournee[] {
  return afficherVides ? [...resumes] : resumes.filter((r) => r.active)
}

export interface TotauxJournees {
  especesCentimes: number
  chequesCentimes: number
  nombreCheques: number
  virementsCentimes: number
  nombreVirements: number
  totalCentimes: number
  nouveauxClients: number
  nombreAnnulations: number
  annulationsCentimes: number
  /** Chèques + virements. */
  bancaireCentimes: number
  nombreOperationsBancaires: number
}

/** R-72 — Totaux du périmètre retenu. */
export function totauxJournees(resumes: readonly ResumeJournee[]): TotauxJournees {
  const somme = (choix: (r: ResumeJournee) => number) =>
    resumes.reduce((total, r) => total + choix(r), 0)

  const especesCentimes = somme((r) => r.especesCentimes)
  const chequesCentimes = somme((r) => r.chequesCentimes)
  const virementsCentimes = somme((r) => r.virementsCentimes)
  const nombreCheques = somme((r) => r.nombreCheques)
  const nombreVirements = somme((r) => r.nombreVirements)

  return {
    especesCentimes,
    chequesCentimes,
    nombreCheques,
    virementsCentimes,
    nombreVirements,
    totalCentimes: especesCentimes + chequesCentimes + virementsCentimes,
    nouveauxClients: somme((r) => r.nouveauxClients),
    nombreAnnulations: somme((r) => r.nombreAnnulations),
    annulationsCentimes: somme((r) => r.annulationsCentimes),
    bancaireCentimes: chequesCentimes + virementsCentimes,
    nombreOperationsBancaires: nombreCheques + nombreVirements,
  }
}

/** R-72 — Total affiché d'une journée : espèces nettes + chèques + virements. */
export function totalJournee(resume: ResumeJournee): number {
  return resume.especesCentimes + resume.chequesCentimes + resume.virementsCentimes
}

/**
 * R-70 — Bascule d'une journée dans la sélection.
 * Reproduit `toggleSelect` du fichier.
 */
export function basculerSelection(
  selection: readonly string[],
  cle: string,
): string[] {
  const copie = [...selection]
  const position = copie.indexOf(cle)
  if (position >= 0) copie.splice(position, 1)
  else copie.push(cle)
  return copie
}

/**
 * R-70 — Bascule « tout sélectionner » sur les journées affichées : si elles
 * sont toutes sélectionnées, la sélection les retire ; sinon elle les ajoute.
 */
export function basculerToutesVisibles(
  selection: readonly string[],
  visibles: readonly ResumeJournee[],
): string[] {
  const courante = new Set(selection)
  const toutes = visibles.length > 0 && visibles.every((r) => courante.has(r.cle))
  for (const resume of visibles) {
    if (toutes) courante.delete(resume.cle)
    else courante.add(resume.cle)
  }
  return [...courante]
}

/**
 * R-70 — Masquer les journées vides retire de la sélection celles qui
 * disparaissent. Reproduit `dailyToggleEmpty()`.
 */
export function selectionApresMasquage(
  selection: readonly string[],
  resumes: readonly ResumeJournee[],
): string[] {
  const actives = new Set(resumes.filter((r) => r.active).map((r) => r.cle))
  return selection.filter((cle) => actives.has(cle))
}

/** R-70 — La sélection ne retient que les journées du mois affiché. */
export function selectionDuMois(
  selection: readonly string[],
  mois: string,
): Set<string> {
  return new Set(selection.filter((cle) => String(cle).slice(0, 7) === mois))
}

/** R-73 — Clé d'une opération bancaire, partagée ou unique. Réutilisée par le registre. */
export function cleOperationBancaire(
  recu: Recu,
  index: number,
): string {
  const versement = recu.versements[index]
  const partagee =
    versement.portee === 'shared' ||
    !!versement.operationPartageeId ||
    versement.montantOperationCentimes > 0
  if (!partagee) return `payment:${identifiantMouvement(recu.id, versement, index)}`
  const identifiant =
    versement.operationPartageeId ||
    identiteOperationPartagee(
      versement.referenceInstrument,
      versement.dateInstrument,
      versement.banque,
    )
  return `shared:${identifiant}`
}
