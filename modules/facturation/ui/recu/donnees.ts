/**
 * Données du reçu imprimable.
 *
 * Couvre : R-79, R-80, R-81, R-85.
 *
 * Reproduit `buildReceiptHtml()` du fichier de référence : les six lignes de
 * paiement sont toujours construites, les champs d'instrument absents portent
 * le motif de remplissage, et le dépassement au-delà de six paiements est
 * signalé.
 *
 * Fonctions pures : aucune dépendance à React, testables sans navigateur.
 */

import { MAX_VERSEMENTS } from '../../domain/constants'
import { centimesEnTexteDevise } from '../../domain/money'
import { natureNormalisee } from '../../domain/payment-method'
import { restantDu, totalPaye } from '../../domain/rules/receipt'
import type { Recu } from '../../domain/types'

/**
 * R-80 — Motif inscrit à la place d'un champ d'instrument absent.
 * Valeur exacte du fichier de référence.
 */
export const MOTIF_REMPLISSAGE = '¤--------¤'

/** Une ligne de paiement du reçu. `null` pour une ligne vide. */
export interface LignePaiement {
  /** Rang affiché, de 1 à 6. */
  rang: number
  banque: string
  dateInstrument: string
  numeroInstrument: string
  /** Nature normalisée : نقد, شيك ou تحويل بنكي. */
  methode: string
  datePaiement: string
  montant: string
  /** R-79 — une ligne sans versement reste présente mais invisible. */
  vide: boolean
}

export interface DonneesRecuImprimable {
  date: string
  nomComplet: string
  numero: string
  programme: string
  chambre: string
  montantConvenu: string
  montantPaye: string
  receveur: string
  reduction: string
  restant: string
  note: string
  nom: string
  prenom: string
  telephone: string
  /** R-79 — toujours six lignes, vides comprises. */
  lignes: LignePaiement[]
  /** R-81 — vrai lorsque le reçu compte plus de six paiements. */
  depassement: boolean
  /** R-81 — message affiché en cas de dépassement, vide sinon. */
  messageDepassement: string
}

/**
 * Prépare les données du reçu imprimable.
 *
 * L'ordre et le contenu des champs sont ceux de `buildReceiptHtml()`.
 */
export function preparerRecuImprimable(recu: Recu): DonneesRecuImprimable {
  const paiements = recu.versements
  const visibles = paiements.slice(0, MAX_VERSEMENTS)

  // R-79 — le tableau compte toujours six lignes.
  const lignes: LignePaiement[] = []
  for (let index = 0; index < MAX_VERSEMENTS; index += 1) {
    const versement = visibles[index]
    if (!versement) {
      lignes.push({
        rang: index + 1,
        banque: '',
        dateInstrument: '',
        numeroInstrument: '',
        methode: '',
        datePaiement: '',
        montant: '',
        vide: true,
      })
      continue
    }
    lignes.push({
      rang: index + 1,
      // R-80 — un champ d'instrument absent porte le motif de remplissage.
      banque: versement.banque || MOTIF_REMPLISSAGE,
      dateInstrument: versement.dateInstrument || MOTIF_REMPLISSAGE,
      numeroInstrument: versement.referenceInstrument || MOTIF_REMPLISSAGE,
      methode: natureNormalisee(versement.nature),
      datePaiement: versement.date || '',
      montant: centimesEnTexteDevise(versement.montantCentimes),
      vide: false,
    })
  }

  // R-81
  const depassement = paiements.length > MAX_VERSEMENTS

  return {
    date: recu.date || '',
    nomComplet: `${recu.prenom || ''} ${recu.nom || ''}`,
    numero: String(recu.numero),
    programme: recu.hotel || '',
    chambre: recu.chambre || '',
    montantConvenu: centimesEnTexteDevise(recu.convenuCentimes),
    montantPaye: centimesEnTexteDevise(totalPaye(recu)),
    // Le receveur est l'employé du premier versement, sinon celui du reçu.
    receveur: recu.versements[0]?.enregistrePar || recu.employe || '—',
    reduction: centimesEnTexteDevise(recu.reductionCentimes),
    restant: centimesEnTexteDevise(restantDu(recu)),
    // Une note vide devient une espace, comme dans le fichier de référence.
    note: recu.note || ' ',
    nom: recu.nom || '',
    prenom: recu.prenom || '',
    telephone: recu.telephone || '',
    lignes,
    depassement,
    messageDepassement: depassement
      ? `Anomalie : ${paiements.length} paiements enregistrés. Maximum prévu : ${MAX_VERSEMENTS}.`
      : '',
  }
}

/**
 * R-81 — L'impression est bloquée au-delà de six paiements.
 *
 * Le fichier de référence interrompt l'impression et affiche :
 * « Ce reçu contient plus de six paiements. L'impression est bloquée jusqu'à
 * définition de la règle métier. »
 *
 * Ce blocage est une règle du fichier que l'inventaire initial ne mentionnait
 * pas ; il est reproduit tel quel et signalé.
 */
export function impressionBloquee(donnees: DonneesRecuImprimable): boolean {
  return donnees.depassement
}

/** Message de blocage, repris tel quel du fichier de référence. */
export const MESSAGE_IMPRESSION_BLOQUEE =
  'Ce reçu contient plus de six paiements. L’impression est bloquée jusqu’à définition de la règle métier.'

/**
 * Le compteur d'impression n'a pas pu être enregistré, mais l'impression a
 * quand même eu lieu (décision actée : ne jamais bloquer l'employé pour un
 * échec de comptage).
 */
export const MESSAGE_COMPTEUR_IMPRESSION_ECHEC =
  'Le compteur d’impression n’a pas pu être enregistré. Le reçu a été imprimé quand même.'

/**
 * R-85 — Libellé du mode original ou copie.
 *
 * Le fichier de référence affiche « نسخة » pour une copie, complété du numéro
 * d'impression à venir lorsque le reçu a déjà été imprimé.
 */
export function libelleCopie(recu: Recu, original: boolean): string {
  if (original) return ''
  // `null` = compteur illisible (voir `data/supabase/read.ts`) : le numéro
  // de copie devient incertain, mais rien n'empêche d'imprimer pour autant —
  // repli explicite sur le libellé de base, jamais un 0 muet.
  if (recu.impressions === null) return 'نسخة'
  return recu.impressions > 0 ? `نسخة — طباعة رقم ${recu.impressions + 1}` : 'نسخة'
}

/**
 * P18 — Le compteur d'impression doit être écrit avant l'ouverture de la
 * boîte d'impression du système, jamais après : `enregistrer` est donc
 * lancé avant l'appel à `imprimer`.
 *
 * Décision actée : un échec du compteur ne bloque plus jamais l'impression
 * elle-même (l'employé doit pouvoir remettre le reçu au client), mais
 * l'erreur n'est jamais avalée en silence — `imprimer()` s'exécute dans tous
 * les cas, puis l'erreur éventuelle est relancée pour que l'appelant
 * l'affiche.
 */
export async function sequenceImpression(
  enregistrer: () => Promise<void>,
  imprimer: () => void,
): Promise<void> {
  let erreurEnregistrement: unknown = null
  try {
    await enregistrer()
  } catch (erreur) {
    erreurEnregistrement = erreur
  }
  imprimer()
  if (erreurEnregistrement) throw erreurEnregistrement
}

/**
 * R-82, R-83 — État de l'atelier d'impression.
 *
 * Le fichier de référence pilote le fond du papier et les repères par des
 * classes sur `<body>`, et le calage par des variables CSS en millimètres.
 * Ces fonctions rendent ce comportement testable sans navigateur.
 */
export function classesAtelier(options: { sansFond: boolean; reperes: boolean }): string {
  return ['recu-atelier', options.sansFond ? 'sans-fond' : '', options.reperes ? 'reperes' : '']
    .filter(Boolean)
    .join(' ')
}

/**
 * Outil de calage d'impression, réservé à l'atelier interne (jamais montré à
 * un employé) : chaque bloc du reçu (signature, tableau des versements,
 * souche) reçoit son propre décalage en millimètres, en plus du décalage
 * global existant et d'une échelle pour compenser une imprimante qui
 * agrandit ou réduit. Toutes les valeurs sont des chaînes de saisie brutes
 * (comme les champs `<input>` d'origine) : elles ne sont bornées qu'au
 * moment de produire les variables CSS, jamais pendant la frappe.
 */
export interface ReglagesCalage {
  decalageX: string
  decalageY: string
  echelle: string
  signatureX: string
  signatureY: string
  versementsX: string
  versementsY: string
  soucheX: string
  soucheY: string
}

/**
 * Réglages par défaut de l'atelier de calage — mesurés par le commanditaire
 * au papier réel, imprimé, le 2026-08-12 (pas seulement à l'écran).
 * Remplacent l'ancien état vierge (tout à zéro, échelle à 100 %), qui
 * n'avait jamais été vérifié contre une vraie impression. « Réinitialiser »
 * ramène désormais ici, plus à zéro — zéro n'a jamais été le bon calage.
 */
export const REGLAGES_CALAGE_PAR_DEFAUT: ReglagesCalage = {
  decalageX: '0.3',
  decalageY: '-1.5',
  echelle: '104.5',
  signatureX: '-4.5',
  signatureY: '-6.5',
  versementsX: '0',
  versementsY: '-1',
  soucheX: '0',
  soucheY: '4',
}

/** Bornes des décalages par bloc, mêmes bornes que le décalage global d'origine. */
const BORNE_DECALAGE_MM = 10
const BORNE_ECHELLE_MIN_POURCENT = 80
const BORNE_ECHELLE_MAX_POURCENT = 120

/** Une saisie vide ou non numérique vaut zéro, comme les champs d'origine. */
export function bornerDecalageMm(valeur: string): number {
  const nombre = Number(valeur)
  if (!Number.isFinite(nombre)) return 0
  return Math.min(BORNE_DECALAGE_MM, Math.max(-BORNE_DECALAGE_MM, nombre))
}

/** Une saisie vide ou non numérique vaut 100 % (aucune mise à l'échelle). */
export function bornerEchellePourcent(valeur: string): number {
  // `Number('')` vaut 0, pas NaN : une chaîne vide doit être détectée avant
  // la conversion, sans quoi un champ vidé retomberait à 80 % (la borne
  // basse) au lieu de 100 % (aucune mise à l'échelle).
  if (valeur.trim() === '') return 100
  const nombre = Number(valeur)
  if (!Number.isFinite(nombre)) return 100
  return Math.min(BORNE_ECHELLE_MAX_POURCENT, Math.max(BORNE_ECHELLE_MIN_POURCENT, nombre))
}

/** Convertit les réglages de calage en variables CSS, bornées et en millimètres. */
export function variablesCalage(reglages: ReglagesCalage): Record<string, string> {
  return {
    '--offset-x': `${bornerDecalageMm(reglages.decalageX)}mm`,
    '--offset-y': `${bornerDecalageMm(reglages.decalageY)}mm`,
    '--offset-scale': `${bornerEchellePourcent(reglages.echelle) / 100}`,
    '--offset-signature-x': `${bornerDecalageMm(reglages.signatureX)}mm`,
    '--offset-signature-y': `${bornerDecalageMm(reglages.signatureY)}mm`,
    '--offset-versements-x': `${bornerDecalageMm(reglages.versementsX)}mm`,
    '--offset-versements-y': `${bornerDecalageMm(reglages.versementsY)}mm`,
    '--offset-souche-x': `${bornerDecalageMm(reglages.soucheX)}mm`,
    '--offset-souche-y': `${bornerDecalageMm(reglages.soucheY)}mm`,
  }
}

/** Résumé texte de tous les réglages actuels, pensé pour être copié-collé tel quel. */
export function resumeReglagesCalage(reglages: ReglagesCalage): string {
  return [
    `Décalage global : X ${bornerDecalageMm(reglages.decalageX)} mm, Y ${bornerDecalageMm(reglages.decalageY)} mm`,
    `Échelle : ${bornerEchellePourcent(reglages.echelle)} %`,
    `Signature : X ${bornerDecalageMm(reglages.signatureX)} mm, Y ${bornerDecalageMm(reglages.signatureY)} mm`,
    `Tableau des versements : X ${bornerDecalageMm(reglages.versementsX)} mm, Y ${bornerDecalageMm(reglages.versementsY)} mm`,
    `Souche (ancrée à 159,2 mm) : X ${bornerDecalageMm(reglages.soucheX)} mm, Y ${bornerDecalageMm(reglages.soucheY)} mm`,
  ].join('\n')
}

/** Nombre de versements affichés par le jeu de test de l'atelier de calage. */
export type NombreVersementsTest = 1 | 6

/**
 * Ligne de versement de test : valeurs fixes et plausibles, jamais tirées
 * d'un vrai reçu. Sert uniquement à comparer visuellement le calage à 1 et à
 * 6 versements, sans dépendre de la disponibilité d'un vrai reçu qui en
 * compte autant.
 */
function ligneVersementTest(rang: number): LignePaiement {
  return {
    rang,
    banque: 'البنك الشعبي',
    dateInstrument: '01/01/2027',
    numeroInstrument: '1234567',
    methode: 'شيك',
    datePaiement: '01/01/2027',
    montant: '5 000 DH',
    vide: false,
  }
}

/**
 * Remplace les lignes de versement par un jeu de test à nombre fixe —
 * réservé à l'atelier de calage, jamais utilisé pour un reçu réellement
 * imprimé. Le reste des données (nom, montants, numéro…) reste celui du vrai
 * reçu ouvert : seul le tableau des versements change.
 */
export function donneesAvecVersementsTest(
  donnees: DonneesRecuImprimable,
  nombre: NombreVersementsTest,
): DonneesRecuImprimable {
  const lignes: LignePaiement[] = Array.from({ length: MAX_VERSEMENTS }, (_, index) => {
    if (index < nombre) return ligneVersementTest(index + 1)
    return {
      rang: index + 1,
      banque: '',
      dateInstrument: '',
      numeroInstrument: '',
      methode: '',
      datePaiement: '',
      montant: '',
      vide: true,
    }
  })
  return { ...donnees, lignes, depassement: false, messageDepassement: '' }
}
