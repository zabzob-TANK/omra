/**
 * Registre des chèques et virements — « Paiements ».
 *
 * Couvre : R-73 à R-77, et les règles d'image R-35, R-36, R-38 à R-40.
 *
 * Reproduit les calculs du fichier de référence : regroupement par opération,
 * date d'enregistrement à l'agence, tri interne par date puis heure, montants
 * attribué et restant, filtres, et conditions d'ajout ou de suppression d'une
 * image.
 *
 * Fonctions pures : aucune dépendance à React ni à la persistance.
 */

import { NATURE_CHEQUE, NATURE_VIREMENT } from '../constants'
import { cleJourDepuisDateFr } from '../dates'
import { identiteOperationPartagee, instrumentEnFrancais, natureNormalisee } from '../payment-method'
import type { OperationPartagee, Recu, ReferenceFichier, Versement } from '../types'
import { identifiantMouvement } from './finance-day'

/** Part d'une opération attribuée à un reçu. */
export interface AttributionOperation {
  numeroRecu: number
  recuId: string
  client: string
  montantCentimes: number
  /** Le reçu porteur est annulé. */
  annule: boolean
  versementId: string
}

/** R-73 — Opération bancaire, partagée ou unique. */
export interface OperationBancaire {
  /** `shared:<id>` ou `payment:<id>`. */
  cle: string
  nature: string
  partagee: boolean
  operation: OperationPartagee | null
  premierRecu: Recu
  premierVersement: Versement
  /** Date d'enregistrement à l'agence, format `jj/mm/aaaa`. */
  dateEnregistrement: string
  cleEnregistrement: string
  /** R-75 — Clé de tri : date puis heure. L'heure n'est jamais affichée. */
  cleTri: string
  montantCentimes: number
  numero: string
  banque: string
  dateInstrument: string
  payeur: string
  employe: string
  image: ReferenceFichier | null
  attributions: AttributionOperation[]
  /** R-77 */
  attribueCentimes: number
  restantCentimes: number
  clients: string[]
  recus: string[]
  /** Libellé français : `Partagé` ou `Unique`. */
  type: 'Partagé' | 'Unique'
}

/** Date `jj/mm/aaaa` extraite d'un texte libre. Reproduit `chequeDateFromText()`. */
export function dateDepuisTexte(texte: string | null | undefined, defaut: string): string {
  const brut = String(texte ?? '')
  const fr = /(\d{2}\/\d{2}\/\d{4})/.exec(brut)
  if (fr) return fr[1]
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(brut)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return defaut || '—'
}

/** Heure extraite d'un texte libre. Reproduit `chequeTimeFromText()`. */
export function heureDepuisTexte(texte: string | null | undefined, defaut: string): string {
  const trouve = /(\d{2}:\d{2})/.exec(String(texte ?? ''))
  return trouve ? trouve[1] : defaut || '00:00'
}

/**
 * R-73 — Rassemble les versements bancaires par opération.
 *
 * Un versement partagé rejoint son opération ; un instrument unique forme sa
 * propre opération. Reproduit `collectChequeOperations()`.
 */
export function collecterOperationsBancaires(
  recus: readonly Recu[],
  operations: readonly OperationPartagee[],
): OperationBancaire[] {
  const parId = new Map(operations.map((o) => [String(o.id), o]))
  const groupes = new Map<string, OperationBancaire>()

  for (const recu of recus) {
    recu.versements.forEach((versement, index) => {
      const nature = natureNormalisee(versement.nature)
      if (nature !== NATURE_CHEQUE && nature !== NATURE_VIREMENT) return

      const partagee =
        versement.portee === 'shared' ||
        !!versement.operationPartageeId ||
        versement.montantOperationCentimes > 0
      const identifiantPartage = partagee
        ? String(
            versement.operationPartageeId ||
              identiteOperationPartagee(
                versement.referenceInstrument,
                versement.dateInstrument,
                versement.banque,
              ),
          )
        : ''
      const cle = partagee
        ? `shared:${identifiantPartage}`
        : `payment:${identifiantMouvement(recu, versement, index)}`

      const operation = partagee ? (parId.get(identifiantPartage) ?? null) : null
      let element = groupes.get(cle)

      if (!element) {
        const texteCreation = partagee && operation ? operation.creeeLe || versement.dateHeure : versement.dateHeure
        const dateEnregistrement = dateDepuisTexte(
          texteCreation,
          versement.date || recu.date || '—',
        )
        const heure = heureDepuisTexte(texteCreation, versement.heure || '00:00')
        const cleEnregistrement = cleJourDepuisDateFr(dateEnregistrement)
        element = {
          cle,
          nature: natureNormalisee((operation && operation.nature) || nature),
          partagee,
          operation,
          premierRecu: recu,
          premierVersement: versement,
          dateEnregistrement,
          cleEnregistrement,
          cleTri: `${cleEnregistrement || '0000-00-00'}T${heure}`,
          montantCentimes: partagee
            ? (operation?.montantTotalCentimes ?? 0) || versement.montantOperationCentimes
            : versement.montantCentimes,
          numero: (operation && operation.reference) || versement.referenceInstrument || '—',
          banque: (operation && operation.banque) || versement.banque || '—',
          dateInstrument:
            (operation && operation.dateInstrument) || versement.dateInstrument || '—',
          payeur:
            (operation && operation.payeur) ||
            versement.payeur ||
            `${recu.prenom || ''} ${recu.nom || ''}`,
          employe:
            (operation && operation.creeePar) || versement.enregistrePar || recu.employe || '—',
          image: partagee ? (operation?.image ?? null) : versement.image,
          attributions: [],
          attribueCentimes: 0,
          restantCentimes: 0,
          clients: [],
          recus: [],
          type: partagee ? 'Partagé' : 'Unique',
        }
        groupes.set(cle, element)
      }

      element.attributions.push({
        numeroRecu: recu.numero,
        recuId: recu.id,
        client: `${recu.prenom || ''} ${recu.nom || ''}`,
        montantCentimes: versement.montantCentimes,
        annule: recu.statut === 'ملغى',
        versementId: versement.id,
      })

      // R-38 — pour une opération partagée, le montant, l'image et la nature
      // viennent toujours de l'opération, jamais du versement.
      if (partagee && operation) {
        element.montantCentimes = operation.montantTotalCentimes || element.montantCentimes
        element.image = operation.image
        element.nature = natureNormalisee(operation.nature || element.nature)
      }
    })
  }

  return [...groupes.values()]
    .map((element) => {
      const attribueCentimes = element.attributions.reduce(
        (somme, a) => somme + a.montantCentimes,
        0,
      )
      return {
        ...element,
        attribueCentimes,
        // R-77
        restantCentimes: element.montantCentimes - attribueCentimes,
        clients: [...new Set(element.attributions.map((a) => a.client))],
        recus: [...new Set(element.attributions.map((a) => String(a.numeroRecu)))],
      }
    })
    // R-75 — tri interne par date puis heure d'enregistrement, décroissant.
    .sort((a, b) =>
      a.cleTri === b.cleTri
        ? String(b.cle).localeCompare(String(a.cle))
        : String(b.cleTri).localeCompare(String(a.cleTri)),
    )
}

/**
 * R-42 — Migration : une image portée par un versement partagé remonte vers son
 * opération.
 *
 * Le fichier de référence corrige ainsi les données anciennes, où l'image avait
 * pu être déposée sur le versement. L'opération devient porteuse ; le versement
 * n'en garde aucune, pour qu'une seule image reste active (R-35, R-38).
 *
 * Fonction pure : elle décrit les déplacements à effectuer, sans rien écrire.
 */
export interface MigrationImage {
  operationId: string
  recuId: string
  versementId: string
  image: ReferenceFichier
}

export function migrationsImagesPartagees(
  recus: readonly Recu[],
  operations: readonly OperationPartagee[],
): MigrationImage[] {
  const parId = new Map(operations.map((o) => [String(o.id), o]))
  const dejaPourvues = new Set<string>()
  const migrations: MigrationImage[] = []

  for (const recu of recus) {
    for (const versement of recu.versements) {
      if (!versement.image) continue
      const operationId = String(versement.operationPartageeId || '')
      if (!operationId) continue
      const operation = parId.get(operationId)
      if (!operation || operation.image || dejaPourvues.has(operationId)) continue
      dejaPourvues.add(operationId)
      migrations.push({
        operationId,
        recuId: recu.id,
        versementId: versement.id,
        image: versement.image,
      })
    }
  }

  return migrations
}

/** R-74 — Filtres du registre. Valeurs exactes du fichier. */
export interface FiltresRegistre {
  /** Journée d'enregistrement `aaaa-mm-jj`, ou vide pour toutes les dates. */
  date: string
  recherche: string
  mode: 'all' | 'cheque' | 'transfer'
  type: 'all' | 'unique' | 'shared'
  image: 'all' | 'with' | 'without'
}

export const FILTRES_REGISTRE_PAR_DEFAUT: FiltresRegistre = {
  date: '',
  recherche: '',
  mode: 'all',
  type: 'all',
  image: 'all',
}

/** R-74 — Applique les filtres, dans l'ordre du fichier. */
export function filtrerOperations(
  operations: readonly OperationBancaire[],
  filtres: FiltresRegistre,
): OperationBancaire[] {
  let sortie = [...operations]

  if (filtres.date) sortie = sortie.filter((x) => x.cleEnregistrement === filtres.date)
  if (filtres.mode === 'cheque') sortie = sortie.filter((x) => x.nature === NATURE_CHEQUE)
  if (filtres.mode === 'transfer') sortie = sortie.filter((x) => x.nature === NATURE_VIREMENT)

  const question = String(filtres.recherche || '').trim().toLowerCase()
  if (question) {
    sortie = sortie.filter((x) =>
      [x.numero, x.banque, x.payeur, x.clients.join(' '), x.recus.join(' '), instrumentEnFrancais(x.nature)]
        .join(' ')
        .toLowerCase()
        .includes(question),
    )
  }

  if (filtres.type === 'unique') sortie = sortie.filter((x) => !x.partagee)
  if (filtres.type === 'shared') sortie = sortie.filter((x) => x.partagee)
  if (filtres.image === 'with') sortie = sortie.filter((x) => !!x.image)
  if (filtres.image === 'without') sortie = sortie.filter((x) => !x.image)

  return sortie
}

/** Montant global des opérations affichées. */
export function montantGlobalCentimes(operations: readonly OperationBancaire[]): number {
  return operations.reduce((somme, x) => somme + x.montantCentimes, 0)
}

/**
 * Un restant nul est affiché « — » et non « 0 ».
 * Reproduit `remainingZero` : le fichier compare à 0,0001 centime près.
 */
export function restantNul(centimes: number): boolean {
  return Math.abs(centimes || 0) < 0.0001
}

/**
 * Couleur du restant : rouge si négatif, bleu si nul, vert sinon.
 *
 * Le bleu du restant nul est celui employé dans toute l'interface pour dire
 * « il ne reste plus rien » — ici, plus rien à répartir sur l'opération. Il
 * remplace le gris du fichier de référence, qui ne distinguait pas cet état.
 *
 * Les trois valeurs sont des jetons de thème et non des codes hexadécimaux :
 * en clair, elles rendent exactement les couleurs du fichier de référence ; en
 * sombre, elles suivent la palette dédiée au lieu de rester illisibles.
 */
export function couleurRestant(centimes: number): string {
  if (centimes < 0) return 'var(--danger)'
  return restantNul(centimes) ? 'var(--solde)' : 'var(--accent)'
}

/* ------------------------------------------------------------------ Images */

/** Motifs de refus d'ajout d'une image. Messages exacts du fichier. */
export type RefusImage =
  | 'operation-deja-enregistree'
  | 'image-deja-presente'
  | 'suppression-reservee-administrateur'
  | 'aucune-image-importee'

export const MESSAGES_IMAGE: Record<RefusImage, string> = {
  'operation-deja-enregistree':
    'Cette opération est déjà enregistrée. Ajoutez l’image depuis le registre des paiements.',
  'image-deja-presente':
    'Une image est déjà associée à cette opération. Une deuxième image est impossible.',
  'suppression-reservee-administrateur': 'Seul l’administrateur peut supprimer l’image.',
  'aucune-image-importee': 'Importez une image avant de l’enregistrer.',
}

/**
 * R-36, R-37 — Conditions d'ouverture de la fenêtre d'ajout d'image.
 *
 * Depuis un formulaire visant une opération partagée **déjà enregistrée**,
 * l'ajout est renvoyé vers le registre. Une image déjà présente interdit toute
 * seconde image, d'où qu'on vienne.
 */
export function refusOuvertureImage(contexte: {
  imageExistante: ReferenceFichier | null
  /** Le formulaire vise une opération partagée existante. */
  operationPartageeExistante?: boolean
}): RefusImage | null {
  if (contexte.operationPartageeExistante) return 'operation-deja-enregistree'
  if (contexte.imageExistante) return 'image-deja-presente'
  return null
}

/** R-35, R-36 — Une opération n'accepte une image que si elle n'en a pas. */
export function peutRecevoirUneImage(operation: OperationBancaire): boolean {
  return !operation.image
}

/** R-39 — La suppression d'une image est réservée à l'administrateur. */
export function peutSupprimerImage(
  operation: OperationBancaire,
  estAdministrateur: boolean,
): boolean {
  return !!operation.image && estAdministrateur
}

/** R-39 — Texte de confirmation exact du fichier. */
export const CONFIRMATION_SUPPRESSION_IMAGE =
  'Supprimer l’image associée à cette opération ?\n\nLes informations du paiement et du reçu resteront inchangées.'

/** Messages de succès, repris du fichier. */
export const MESSAGE_IMAGE_ENREGISTREE = 'Image enregistrée.'
export const MESSAGE_IMAGE_SUPPRIMEE =
  'L’image a été supprimée. L’opération est de nouveau sans image.'

/** Libellés dépendant de la nature de l'instrument. */
export function libellesInstrument(nature: string): {
  titreAjout: string
  libelleReference: string
  libelleDate: string
  alternativeImage: string
  libelleImport: string
  sansImage: string
  entete: (numero: string) => string
} {
  const virement = natureNormalisee(nature) === NATURE_VIREMENT
  return {
    titreAjout: virement
      ? 'Ajouter le justificatif du virement'
      : 'Ajouter l’image du chèque',
    libelleReference: virement ? 'Référence du virement' : 'N° du chèque',
    libelleDate: virement ? 'Date du virement' : 'Date inscrite sur le chèque',
    alternativeImage: virement ? 'Justificatif du virement' : 'Image du chèque',
    libelleImport: virement
      ? 'Importer ou photographier le justificatif'
      : 'Importer ou photographier le chèque',
    sansImage: virement
      ? 'Le justificatif reste facultatif et pourra être ajouté plus tard.'
      : 'L’image pourra être ajoutée depuis le module de démonstration.',
    entete: (numero: string) =>
      virement ? `Virement — référence ${numero}` : `Chèque n° ${numero}`,
  }
}
