/**
 * Modification d'un reçu, section par section.
 *
 * Couvre : R-49 à R-55.
 *
 * Une seule section est modifiable à la fois, le motif est toujours obligatoire,
 * et chaque changement est consigné champ par champ. Le rabatteur et les
 * montants des versements ne sont jamais modifiables.
 */

import { NATURE_ESPECES, STATUT_ANNULE } from '../constants'
import { dateFrValide } from '../dates'
import { formaterTelephone, telephoneNormalise } from '../format'
import { centimesEnTexteDevise, dirhamsSaisisEnCentimes } from '../money'
import { natureNormalisee } from '../payment-method'
import { depasseLeRestant, etatOperation } from './shared-payment'
import type {
  ChangementChamp,
  OperationPartagee,
  PorteeVersement,
  Recu,
  SectionModifiable,
  Tarif,
  Versement,
} from '../types'
import {
  erreur,
  erreurs,
  montantPourMessage,
  ok,
  type ErreurValidation,
  type Resultat,
} from './errors'
import {
  construireGrille,
  montantConvenu,
  reductionAtteintLeTarif,
  reductionDepasseLePlafond,
} from './tarif'

/** R-49 — Sections modifiables, et elles seules. */
export const SECTIONS_MODIFIABLES: readonly SectionModifiable[] = [
  'identity',
  'contact',
  'program',
  'group',
  'note',
  'firstPayment',
] as const

/**
 * Libellés des sections, repris tels quels de `editSectionName()`.
 * Ils sont enregistrés dans l'historique des modifications et dans le journal :
 * les traduire changerait les données produites.
 */
export const LIBELLES_SECTIONS: Record<SectionModifiable, string> = {
  identity: 'الهوية',
  contact: 'الهاتف',
  program: 'البرنامج والسعر',
  group: 'المجموعة / العائلة',
  note: 'الملاحظة',
  // Décision du commanditaire (2026-08-09) : n'importe quel versement peut
  // être visé, pas seulement le premier — le libellé générique reste correct
  // dans tous les cas ; `preparerModification` précise le rang exact pour le
  // journal d'historique (`sectionLibelle` du résultat).
  firstPayment: 'طريقة الدفعة',
}

/**
 * Noms de champs consignés dans l'historique, repris de `pushChange()`.
 * Ces libellés sont stockés dans les données : ils ne sont pas traduits.
 */
/**
 * Exporté (2026-08-09) : réutilisé tel quel par `modification-history.ts`
 * pour reconstruire l'historique détaillé (Suivi journalier, fiche du
 * reçu) — décision du commanditaire de ne jamais dupliquer ces libellés.
 */
export const CHAMPS = {
  prenom: 'الاسم',
  nom: 'النسب',
  telephone: 'رقم الهاتف',
  hotel: 'الفندق',
  vol: 'الرحلة',
  chambre: 'الغرفة',
  tarif: 'الثمن الأصلي',
  reduction: 'التخفيض',
  convenu: 'المبلغ المتفق عليه',
  groupe: 'المجموعة',
  note: 'الملاحظة',
  nature: 'طريقة الدفع',
  reference: 'رقم الشيك / المرجع',
  dateInstrument: 'تاريخ العملية',
  banque: 'البنك',
  payeur: 'الدافع',
  montantOperation: 'قيمة العملية',
  // Décision du commanditaire (2026-08-09) : n'importe quel versement, plus
  // seulement le premier — corrigé en même temps que le reste de ce libellé
  // ailleurs dans le fichier (LIBELLES_SECTIONS, montantAdministrateur...).
  montant: 'مبلغ الدفعة',
} as const

export interface SaisieModification {
  section: SectionModifiable | ''
  motif: string
  // Identité
  prenom: string
  nom: string
  // Contact
  telephone: string
  // Programme
  hotel: string
  vol: string
  chambre: string
  /** Réduction saisie en dirhams. */
  reduction: string
  // Groupe
  groupeCoche: boolean
  groupe: string
  // Note
  note: string
  // Versement corrigé — méthode et instrument
  nature: string
  reference: string
  dateInstrument: string
  banque: string
  operationPartagee: boolean
  payeur: string
  /** Montant total de l'opération, saisi en dirhams. */
  montantOperation: string
  /**
   * §5.9 — Nouveau montant du versement corrigé, saisi en dirhams.
   * Vide : aucune correction demandée. Réservé à l'administrateur.
   */
  montant: string
  /**
   * Décision du commanditaire (2026-08-09) : le versement corrigé n'est plus
   * toujours le premier — l'utilisateur le désigne explicitement par son
   * rang (1 à 6). `0` : aucun versement encore choisi.
   */
  rangVersementCorrige: number
}

/**
 * P01, §5.9 — Nouvelles valeurs d'un versement après correction.
 *
 * Décision du commanditaire (2026-08-09) : n'importe quel versement du
 * reçu peut être corrigé, désigné explicitement par `rang` — plus
 * seulement le premier. La correction du montant reste réservée à
 * l'administrateur (règle inchangée).
 */
export interface CorrectionPremierVersement {
  /** Rang (1 à 6) du versement corrigé — désigné explicitement, jamais déduit. */
  rang: number
  montantCentimes: number
  nature: string
  referenceInstrument: string
  dateInstrument: string
  banque: string
  portee: PorteeVersement
  operationPartageeId: string
  payeur: string
  montantOperationCentimes: number
}

export interface ResultatModification {
  section: SectionModifiable
  sectionLibelle: string
  motif: string
  changements: ChangementChamp[]
  /** Champs du reçu à mettre à jour. Vide pour la section `firstPayment`. */
  champsModifies: Partial<Recu>
  /**
   * P01 — Présent uniquement pour la section `firstPayment` : le premier
   * versement ne s'exprime pas comme un `Partial<Recu>`, il porte donc sa
   * propre méthode de port dédiée (`RecusPort.corrigerPremierVersement`).
   */
  premierVersementCorrige?: {
    versement: CorrectionPremierVersement
    /** Opération créée par un passage unique → partagé, sinon `null`. */
    nouvelleOperation: OperationPartagee | null
  }
}

export interface ContexteModification {
  tarifs: readonly Tarif[]
  reductionMaxCentimes: number
  /** §5.9 — seul un administrateur peut corriger le montant du 1er versement. */
  estAdministrateur: boolean
  /** Identifiant à donner à une nouvelle opération partagée. */
  nouvelIdOperation: () => string
  /** Horodatage de la correction, pour une nouvelle opération éventuelle. */
  horodatage: string
  /** Employé à l'origine de la correction. */
  employe: string
  /**
   * R-32 — nécessaires pour calculer le disponible d'une opération partagée
   * déjà utilisée, quand la correction du premier versement en change le
   * montant alloué.
   */
  operations: readonly OperationPartagee[]
  /**
   * Décision de performance (2026-08-09) : tous les versements de la saison,
   * à plat — seul `operationPartageeId`/`montantCentimes` est nécessaire ici
   * (`etatOperation`), jamais un `Recu[]` complet.
   */
  versements: readonly Pick<Versement, 'operationPartageeId' | 'montantCentimes'>[]
  /** R-32 — confirmation explicite d'un dépassement d'opération partagée. */
  depassementConfirme?: boolean
}

/**
 * Compare deux valeurs comme le fait `same()` du fichier de référence :
 * conversion en chaîne, `null` et `undefined` valant la chaîne vide.
 */
export function memeValeur(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '')
}

/**
 * R-51 — Consigne un changement, seulement s'il y en a un.
 * Reproduit `pushChange()`.
 */
export function consignerChangement(
  liste: ChangementChamp[],
  champ: string,
  ancienne: unknown,
  nouvelle: unknown,
): void {
  if (!memeValeur(ancienne, nouvelle)) {
    liste.push({
      champ,
      ancienne: String(ancienne ?? ''),
      nouvelle: String(nouvelle ?? ''),
    })
  }
}

/**
 * R-53 — Une opération partagée ne se modifie pas depuis le reçu.
 *
 * Reproduit le refus de `editFirstPayment()` : les données d'une opération
 * mutualisée appartiennent au registre des paiements, pas à un reçu
 * particulier. Décision du commanditaire (2026-08-09) : s'applique à
 * n'importe quel versement du reçu, désigné explicitement — jamais
 * seulement au premier. Un versement partagé reste correctible ailleurs
 * (registre des paiements) ; ce contrôle porte uniquement sur la fenêtre
 * de modification du reçu.
 */
export function versementModifiable(versement: Pick<Versement, 'portee' | 'operationPartageeId'>): boolean {
  return !(versement.portee === 'shared' || versement.operationPartageeId)
}

/**
 * R-49 à R-55 — Valide et prépare une modification.
 *
 * L'ordre reproduit `saveEdit()` : le motif est contrôlé en premier, puis les
 * champs de la section choisie, toutes les erreurs étant cumulées.
 */
export function preparerModification(
  saisie: SaisieModification,
  recu: Recu,
  contexte: ContexteModification,
): Resultat<ResultatModification> {
  // P06 — un reçu annulé est verrouillé.
  if (recu.statut === STATUT_ANNULE) return erreur('recu', 'recu-annule')

  // R-49
  if (!saisie.section) return erreurs([{ champ: 'section', code: 'section-obligatoire' }])
  const section = saisie.section

  const liste: ErreurValidation[] = []
  const changements: ChangementChamp[] = []
  const champsModifies: Partial<Recu> = {}

  // R-50 — le motif est contrôlé avant tout le reste.
  if (!saisie.motif.trim()) {
    liste.push({ champ: 'motif', code: 'motif-modification-obligatoire' })
  }

  if (section === 'identity') {
    if (!saisie.prenom.trim()) liste.push({ champ: 'prenom', code: 'prenom-obligatoire' })
    if (!saisie.nom.trim()) liste.push({ champ: 'nom', code: 'nom-obligatoire' })
    consignerChangement(changements, CHAMPS.prenom, recu.prenom, saisie.prenom.trim())
    consignerChangement(changements, CHAMPS.nom, recu.nom, saisie.nom.trim())
    champsModifies.prenom = saisie.prenom.trim()
    champsModifies.nom = saisie.nom.trim()
  }

  if (section === 'contact') {
    // Même normalisation, à la lettre, que la création (`create-receipt.ts`) :
    // c'était leur divergence qui refusait à la modification un numéro que
    // la création avait accepté tel quel.
    const telephoneValide = telephoneNormalise(saisie.telephone)
    if (!saisie.telephone.trim()) {
      liste.push({ champ: 'telephone', code: 'telephone-obligatoire' })
    } else if (telephoneValide === null) {
      liste.push({ champ: 'telephone', code: 'telephone-dix-chiffres' })
    }
    // Historique lisible dans le même style que la valeur d'origine
    // (`recu.telephone`, déjà mise en forme à la lecture) — jamais les 10
    // chiffres bruts stockés. Écho de la saisie tel quel si elle est
    // invalide : de toute façon écarté par `liste.length` plus bas.
    const telephoneAffiche = telephoneValide ? formaterTelephone(telephoneValide) : saisie.telephone
    consignerChangement(changements, CHAMPS.telephone, recu.telephone, telephoneAffiche)
    // Validé plus haut si `liste` reste vide : seul format transmis à
    // l'écriture — 10 chiffres bruts, aucune mise en forme.
    champsModifies.telephone = telephoneValide ?? saisie.telephone
  }

  if (section === 'program') {
    if (!saisie.hotel) liste.push({ champ: 'hotel', code: 'hotel-obligatoire' })
    if (!saisie.vol) liste.push({ champ: 'vol', code: 'vol-obligatoire' })
    if (!saisie.chambre) liste.push({ champ: 'chambre', code: 'chambre-obligatoire' })

    const grille = construireGrille(contexte.tarifs)
    const nouveauTarif = grille.tarifPour(saisie.hotel, saisie.vol, saisie.chambre)
    const nouvelleReduction = dirhamsSaisisEnCentimes(saisie.reduction)
    let nouveauConvenu = recu.convenuCentimes

    // R-52
    if (nouveauTarif === null) {
      liste.push({ champ: 'hotel', code: 'tarif-introuvable-combinaison' })
    } else {
      if (reductionDepasseLePlafond(nouvelleReduction, contexte.reductionMaxCentimes)) {
        liste.push({
          champ: 'reduction',
          code: 'reduction-superieure-au-plafond',
          parametres: { plafond: montantPourMessage(contexte.reductionMaxCentimes) },
        })
      }
      if (reductionAtteintLeTarif(nouvelleReduction, nouveauTarif)) {
        liste.push({ champ: 'reduction', code: 'reduction-superieure-ou-egale-au-tarif' })
      }
      nouveauConvenu = montantConvenu(nouveauTarif, nouvelleReduction)

      // P13 — un nouveau convenu sous le montant déjà encaissé est autorisé :
      // le trop-perçu qui en résulte n'est jamais un refus (§5.11), seulement
      // une anomalie visible une fois le restant devenu négatif.

      champsModifies.tarifCentimes = nouveauTarif
      champsModifies.reductionCentimes = nouvelleReduction
      champsModifies.convenuCentimes = nouveauConvenu
      champsModifies.hotel = saisie.hotel
      champsModifies.vol = saisie.vol
      champsModifies.chambre = saisie.chambre
    }

    consignerChangement(changements, CHAMPS.hotel, recu.hotel, saisie.hotel)
    consignerChangement(changements, CHAMPS.vol, recu.vol, saisie.vol)
    consignerChangement(changements, CHAMPS.chambre, recu.chambre, saisie.chambre)
    consignerChangement(
      changements,
      CHAMPS.tarif,
      centimesEnTexteDevise(recu.tarifCentimes),
      nouveauTarif === null ? '—' : centimesEnTexteDevise(nouveauTarif),
    )
    consignerChangement(
      changements,
      CHAMPS.reduction,
      centimesEnTexteDevise(recu.reductionCentimes),
      centimesEnTexteDevise(nouvelleReduction),
    )
    consignerChangement(
      changements,
      CHAMPS.convenu,
      centimesEnTexteDevise(recu.convenuCentimes),
      nouveauTarif === null ? '—' : centimesEnTexteDevise(nouveauConvenu),
    )
  }

  if (section === 'group') {
    if (saisie.groupeCoche && !saisie.groupe.trim()) {
      liste.push({ champ: 'groupe', code: 'groupe-obligatoire' })
    }
    const nouveauGroupe = saisie.groupeCoche ? saisie.groupe.trim() : ''
    consignerChangement(changements, CHAMPS.groupe, recu.groupe || '', nouveauGroupe)
    champsModifies.groupe = nouveauGroupe
  }

  if (section === 'note') {
    consignerChangement(changements, CHAMPS.note, recu.note || '', saisie.note || '')
    champsModifies.note = saisie.note || ''
  }

  let premierVersementCorrige: ResultatModification['premierVersementCorrige']

  if (section === 'firstPayment') {
    // Décision du commanditaire (2026-08-09) : le versement corrigé n'est
    // plus toujours le premier — désigné explicitement par son rang, jamais
    // déduit. `0` : aucun versement encore choisi dans l'écran (ne devrait
    // pas arriver si l'interface impose un choix avant la saisie).
    const premier = recu.versements.find((v) => v.rang === saisie.rangVersementCorrige)
    if (!premier) {
      liste.push({ champ: 'nature', code: 'versement-cible-introuvable' })
    }

    const espece = natureNormalisee(saisie.nature) === NATURE_ESPECES
    if (!espece) {
      if (!saisie.reference.trim()) {
        liste.push({ champ: 'reference', code: 'reference-instrument-obligatoire' })
      }
      if (!saisie.dateInstrument.trim()) {
        liste.push({ champ: 'dateInstrument', code: 'date-instrument-obligatoire' })
      } else if (!dateFrValide(saisie.dateInstrument)) {
        liste.push({ champ: 'dateInstrument', code: 'date-instrument-invalide' })
      }
      if (!saisie.banque.trim()) liste.push({ champ: 'banque', code: 'banque-obligatoire' })
      if (saisie.operationPartagee) {
        if (!saisie.payeur.trim()) liste.push({ champ: 'payeur', code: 'payeur-obligatoire' })
        if (!saisie.montantOperation.trim()) {
          liste.push({ champ: 'montantOperation', code: 'montant-operation-obligatoire' })
        }
      }
    }

    // P01, §5.9 — le montant est réservé à l'administrateur.
    let montantCentimes = premier?.montantCentimes ?? 0
    const montantSaisi = saisie.montant.trim()
    if (montantSaisi) {
      const nouveauMontant = dirhamsSaisisEnCentimes(montantSaisi)
      if (nouveauMontant !== montantCentimes) {
        if (!contexte.estAdministrateur) {
          liste.push({ champ: 'montant', code: 'montant-premier-versement-reserve-administrateur' })
        } else if (nouveauMontant <= 0) {
          liste.push({ champ: 'montant', code: 'montant-doit-etre-positif' })
        } else if (premier) {
          // Décision du commanditaire (2026-08-09) : cette correction ne
          // doit jamais créer de trop-perçu — comparé au vrai disponible
          // (convenu − somme des AUTRES versements), jamais au seul convenu
          // total. Avec plusieurs versements déjà enregistrés, comparer au
          // convenu total laisserait passer un dépassement réel. La RPC
          // revalide ce même plafond côté serveur, source d'autorité finale.
          const autresVersementsCentimes = recu.versements
            .filter((v) => v.rang !== premier.rang)
            .reduce((somme, v) => somme + v.montantCentimes, 0)
          const disponibleCentimes = recu.convenuCentimes - autresVersementsCentimes
          if (nouveauMontant > disponibleCentimes) {
            liste.push({ champ: 'montant', code: 'montant-depasse-le-convenu' })
          } else {
            montantCentimes = nouveauMontant
          }
        } else {
          montantCentimes = nouveauMontant
        }
      }
    }

    if (premier && liste.length === 0) {
      // R-53 — seuls la méthode, l'instrument et (pour un administrateur) le
      // montant changent : le rattachement à une opération déjà utilisée ne
      // se recrée pas silencieusement.
      const reference = espece ? '' : saisie.reference.trim()
      const dateInstrument = espece ? '' : saisie.dateInstrument.trim()
      const banque = espece ? '' : saisie.banque.trim()
      const dejaPartage = premier.portee === 'shared'
      const resteParage = !espece && saisie.operationPartagee

      let operationPartageeId = ''
      let payeur = ''
      let montantOperationCentimes = 0
      let nouvelleOperation: OperationPartagee | null = null

      if (resteParage) {
        if (dejaPartage) {
          // §5.8 — une opération déjà utilisée garde son montant, son payeur
          // et son rattachement verrouillés.
          operationPartageeId = premier.operationPartageeId
          payeur = premier.payeur
          montantOperationCentimes = premier.montantOperationCentimes
        } else {
          // Passage unique → partagé : une nouvelle opération est créée,
          // comme à la création d'un reçu (cf. `preparerInstrument`, R-28).
          operationPartageeId = contexte.nouvelIdOperation()
          payeur = saisie.payeur.trim()
          montantOperationCentimes = dirhamsSaisisEnCentimes(saisie.montantOperation)
          nouvelleOperation = {
            id: operationPartageeId,
            nature: saisie.nature,
            reference,
            dateInstrument,
            banque,
            payeur,
            montantTotalCentimes: montantOperationCentimes,
            creeeLe: contexte.horodatage,
            creeePar: contexte.employe,
            statut: 'active',
            image: null,
          }
        }
      }

      const portee: PorteeVersement = resteParage ? 'shared' : 'unique'

      // R-32 — un dépassement doit être confirmé explicitement. Pour une
      // opération déjà partagée et conservée, le montant déjà alloué inclut
      // encore l'ancien montant de ce même versement : le disponible pour le
      // nouveau montant est donc le restant actuel plus ce que ce versement y
      // occupait déjà (il ne s'ajoute pas, il le remplace).
      if (resteParage) {
        const disponibleCentimes = dejaPartage
          ? (() => {
              const operation = contexte.operations.find((o) => o.id === operationPartageeId)
              const restant = operation ? etatOperation(operation, contexte.versements).restantCentimes : 0
              return restant + premier.montantCentimes
            })()
          : montantOperationCentimes

        if (depasseLeRestant(montantCentimes, disponibleCentimes) && !contexte.depassementConfirme) {
          return {
            statut: 'confirmation-requise',
            motif: 'depassement-operation-partagee',
            montantCentimes,
            disponibleCentimes,
          }
        }
      }

      premierVersementCorrige = {
        versement: {
          rang: premier.rang,
          montantCentimes,
          nature: saisie.nature,
          referenceInstrument: reference,
          dateInstrument,
          banque,
          portee,
          operationPartageeId,
          payeur,
          montantOperationCentimes,
        },
        nouvelleOperation,
      }

      consignerChangement(changements, CHAMPS.nature, premier.nature, saisie.nature)
      consignerChangement(changements, CHAMPS.reference, premier.referenceInstrument, reference)
      consignerChangement(
        changements,
        CHAMPS.dateInstrument,
        premier.dateInstrument,
        dateInstrument,
      )
      consignerChangement(changements, CHAMPS.banque, premier.banque, banque)
      consignerChangement(changements, CHAMPS.payeur, premier.payeur, payeur)
      consignerChangement(
        changements,
        CHAMPS.montantOperation,
        centimesEnTexteDevise(premier.montantOperationCentimes),
        centimesEnTexteDevise(montantOperationCentimes),
      )
      consignerChangement(
        changements,
        CHAMPS.montant,
        centimesEnTexteDevise(premier.montantCentimes),
        centimesEnTexteDevise(montantCentimes),
      )
    }
  }

  if (liste.length) return erreurs(liste)

  // Décision du commanditaire (2026-08-09) : le journal d'historique doit
  // dire précisément quel versement a été corrigé, pas seulement « la
  // méthode de la dfp » — sinon une correction du 3ᵉ versement se lit comme
  // une correction du premier dans le récapitulatif du reçu.
  const sectionLibelle =
    section === 'firstPayment' && premierVersementCorrige
      ? `${LIBELLES_SECTIONS[section]} — الدفعة رقم ${premierVersementCorrige.versement.rang}`
      : LIBELLES_SECTIONS[section]

  return ok({
    section,
    sectionLibelle,
    motif: saisie.motif.trim(),
    changements,
    champsModifies,
    premierVersementCorrige,
  })
}

/**
 * Précision du commanditaire (2026-08-09) : avant d'enregistrer une
 * modification, l'écran doit montrer la fiche complète du reçu telle
 * qu'elle sera APRÈS — pas seulement la liste des champs touchés. Construit
 * cet « après » en appliquant `ResultatModification` sur le reçu `avant`,
 * sans écriture : pure fonction du domaine, réutilisable pour un aperçu côté
 * client comme pour toute autre projection future.
 *
 * Pour `firstPayment`, seul le versement ciblé (`rang`) est remplacé — les
 * autres versements et leur instantané figé restent strictement identiques,
 * comme à l'écriture réelle (aucune cascade, voir la RPC correspondante).
 */
export function apercuApresModification(recu: Recu, resultat: ResultatModification): Recu {
  if (resultat.premierVersementCorrige) {
    const { versement } = resultat.premierVersementCorrige
    return {
      ...recu,
      versements: recu.versements.map((courant) =>
        courant.rang === versement.rang
          ? {
              ...courant,
              montantCentimes: versement.montantCentimes,
              nature: versement.nature,
              referenceInstrument: versement.referenceInstrument,
              dateInstrument: versement.dateInstrument,
              banque: versement.banque,
              portee: versement.portee,
              operationPartageeId: versement.operationPartageeId,
              payeur: versement.payeur,
              montantOperationCentimes: versement.montantOperationCentimes,
            }
          : courant,
      ),
    }
  }
  return { ...recu, ...resultat.champsModifies }
}

/**
 * R-54, R-55 — Champs et versements jamais modifiables, quel que soit le rôle.
 *
 * Rendus explicites pour être testables et pour que l'interface les grise sans
 * dupliquer la règle.
 *
 * §5.9 — le montant du premier versement n'appartient plus à cette liste
 * depuis que l'administrateur (slot 1) peut le corriger (voir plus haut dans
 * ce fichier, section `firstPayment` de `preparerModification`) : ce n'est pas
 * un champ « jamais modifiable », mais un champ modifiable par un seul rôle.
 * Un employé (slots 2 à 6) reste bloqué sur ce montant précis — cette
 * restriction est imposée par `contexte.estAdministrateur` dans
 * `preparerModification`, pas par cette liste, qui ne décrit que ce qui est
 * verrouillé pour tout le monde sans exception.
 */
export const CHAMPS_NON_MODIFIABLES = ['numero', 'date', 'rabatteur'] as const
