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
 * classes sur `<body>`, et le calage par deux variables CSS en millimètres.
 * Ces fonctions rendent ce comportement testable sans navigateur.
 */
export function classesAtelier(options: { sansFond: boolean; reperes: boolean }): string {
  return ['recu-atelier', options.sansFond ? 'sans-fond' : '', options.reperes ? 'reperes' : '']
    .filter(Boolean)
    .join(' ')
}

/**
 * R-83 — Décalages de calage, bornés à ±10 mm comme les champs du fichier.
 * Une saisie vide ou non numérique vaut zéro.
 */
export function variablesDecalage(x: string, y: string): { '--offset-x': string; '--offset-y': string } {
  const borner = (valeur: string) => {
    const nombre = Number(valeur)
    if (!Number.isFinite(nombre)) return 0
    return Math.min(10, Math.max(-10, nombre))
  }
  return {
    '--offset-x': `${borner(x)}mm`,
    '--offset-y': `${borner(y)}mm`,
  }
}
