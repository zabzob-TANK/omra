/**
 * Service applicatif — orchestre les règles du domaine et les ports.
 *
 * C'est ici que se rencontrent le noyau métier (pur) et la persistance
 * (adaptateur). Aucune règle n'y est réécrite : le service se contente
 * d'appeler les fonctions de `domain/rules/`, puis d'enregistrer le résultat.
 *
 * Ces fonctions sont appelées depuis des Server Actions. Elles ne dépendent ni
 * de React ni de Next.js et restent transférables telles quelles.
 */

import {
  cleJour,
  cleJourDepuisDateFr,
  dateDuJour,
  dateFrDepuisCleJour,
  dateFrDepuisHorodatage,
  decalerCleJour,
  heureCourante,
  heureDepuisHorodatage,
  horodatage,
} from '../domain/dates'
import { NATURE_CHEQUE, NATURE_ESPECES, NATURE_VIREMENT } from '../domain/constants'
import { centimesEnTexte } from '../domain/money'
import { natureNormalisee } from '../domain/payment-method'
import {
  anomaliesCandidates,
  anomaliesEnAttente,
  annulationsDeLaPeriode,
  badgeVersement,
  bornesWeekEnd,
  codeImpression,
  codeImpressionBandeau,
  codeMode,
  collecterMouvements,
  dansLaPeriode,
  etatImpression,
  etatVeille,
  nombreDePages,
  peutImprimer,
  totalAnnuleCentimes,
  totauxFinance,
  trierMouvements,
  type PeriodeFinance,
  type TotauxFinance,
} from '../domain/rules/finance-day'
import {
  NOMS_JOURS,
  cleOperationBancaire,
  etatControle,
  journeesVisibles,
  joursDuMois,
  moisValide,
  perimetreDeCalcul,
  resumesDuMois,
  selectionDuMois,
  totalJournee,
  totauxJournees,
} from '../domain/rules/daily'
import {
  collecterOperationsBancaires,
  couleurRestant,
  filtrerOperations,
  libellesInstrument,
  migrationsImagesPartagees,
  montantGlobalCentimes,
  peutSupprimerImage,
  restantNul,
  type FiltresRegistre,
  type OperationBancaire,
} from '../domain/rules/cheque-register'
import type {
  ContexteCreation,
  ResultatCreation,
  SaisieNouveauRecu,
} from '../domain/rules/create-receipt'
import { preparerCreationRecu } from '../domain/rules/create-receipt'
import type { Resultat } from '../domain/rules/errors'
import { ok } from '../domain/rules/errors'
import type { SaisieVersement } from '../domain/rules/payment'
import { preparerVersement } from '../domain/rules/payment'
import type { SaisieAnnulation } from '../domain/rules/cancellation'
import { preparerAnnulation } from '../domain/rules/cancellation'
import type { ResultatModification, SaisieModification } from '../domain/rules/edit-sections'
import { preparerModification } from '../domain/rules/edit-sections'
import { centimesEnTexteDevise } from '../domain/money'
import { estWeekEnd } from '../domain/dates'
import { instrumentEnFrancais } from '../domain/payment-method'
import type {
  Chambre,
  ChangementChamp,
  EntreeAudit,
  Hotel,
  ImpressionFinance,
  ReferenceFichier,
  Modification,
  OperationPartagee,
  PageJournalOperations,
  Rabatteur,
  Recu,
  Saison,
  Tarif,
  Utilisateur,
  Vol,
} from '../domain/types'
import { modeDemonstration, sourceDonnees } from './index'
import { FormatImageNonAccepteError, SaisonIndisponibleError, SectionIndisponibleError } from './ports'
import type { FiltresJournalOperations } from './ports'
import type { SourceDonnees } from './ports'

/** Instantané complet servi à l'interface. */
export interface EtatFacturation {
  utilisateur: Utilisateur | null
  estAdministrateur: boolean
  /**
   * Vrai lorsqu'aucune saison active n'existe (avant la première saison, ou
   * entre deux) — état d'exploitation normal, pas une panne. Les autres
   * champs ci-dessous sont alors vides plutôt qu'absents ; l'interface doit
   * les ignorer et afficher un message propre plutôt que le registre, Finance,
   * le suivi journalier ou les paiements.
   */
  saisonIndisponible: boolean
  saison: Saison
  hotels: Hotel[]
  vols: Vol[]
  chambres: Chambre[]
  rabatteurs: Rabatteur[]
  tarifs: Tarif[]
  recus: Recu[]
  operations: OperationPartagee[]
  /**
   * R-38 — URL affichable de l'image de chaque opération partagée qui en porte
   * une, indexée par identifiant d'opération. Le domaine et l'interface ne
   * manipulent que des références ; c'est le stockage de fichiers qui résout.
   */
  imagesOperations: Record<string, string>
  /** R-90 — URL du portrait du passeport, par identifiant de reçu. */
  portraitsPasseport: Record<string, string>
  audit: EntreeAudit[]
  modeDemonstration: boolean
}

/**
 * État affiché avant toute connexion, sur la porte propre à la Facturation
 * (séparation étanche Facturation/Administration). `chargerEtat()` n'est pas
 * appelable ici : les RPC exigent déjà une session (`resolve_facturation_actor()`).
 * `ApplicationFacturation` s'arrête sur `EcranConnexion` dès que
 * `utilisateur` est `null`, avant de toucher aux autres champs — leurs
 * valeurs ne sont donc jamais affichées.
 */
export function etatAnonyme(): EtatFacturation {
  return {
    utilisateur: null,
    estAdministrateur: false,
    saisonIndisponible: false,
    saison: { id: '', nom: '', reductionMaxCentimes: 0, duree: '', active: false },
    hotels: [],
    vols: [],
    chambres: [],
    rabatteurs: [],
    tarifs: [],
    recus: [],
    operations: [],
    imagesOperations: {},
    portraitsPasseport: {},
    audit: [],
    modeDemonstration: modeDemonstration(),
  }
}

async function tracer(
  source: SourceDonnees,
  action: string,
  detail: string,
  utilisateur: Utilisateur | null,
): Promise<void> {
  // R-86 — chaque action laisse une trace, la plus récente en tête.
  await source.audit.enregistrer({
    id: source.identifiants.nouvelId('audit'),
    horodatage: horodatage(source.horloge.maintenant()),
    action,
    detail,
    utilisateur: utilisateur?.nom ?? '—',
  })
}

/**
 * Écran de connexion du fichier de référence.
 * Renvoie `null` lorsque le couple identifiant / mot de passe est refusé.
 */
export async function connecter(
  identifiant: string,
  motDePasse: string,
): Promise<Utilisateur | null> {
  const source = sourceDonnees()
  const utilisateur = await source.session.connecter(identifiant, motDePasse)
  if (utilisateur) await tracer(source, 'دخول', 'اتصال بالنظام', utilisateur)
  return utilisateur
}

/**
 * Trace la déconnexion, comme `logout()` du fichier de référence, puis ferme
 * réellement la session. Avant la séparation étanche Facturation/
 * Administration, cette fonction ne faisait que tracer : la fermeture réelle
 * passait par la route /logout, partagée avec l'Administration. La
 * Facturation ayant maintenant sa propre porte, c'est ici que la session doit
 * être invalidée.
 */
export async function deconnecter(): Promise<void> {
  const source = sourceDonnees()
  const utilisateur = await source.session.utilisateurCourant()
  await tracer(source, 'خروج', 'قطع الاتصال', utilisateur)
  await source.session.deconnecter()
}

/** Charge tout ce dont l'interface a besoin, en une fois. */
export async function chargerEtat(): Promise<EtatFacturation> {
  const source = sourceDonnees()
  const utilisateur = await source.session.utilisateurCourant()

  let saison: Saison
  try {
    saison = await source.referentiels.saisonActive()
  } catch (erreur) {
    if (!(erreur instanceof SaisonIndisponibleError)) throw erreur
    // Aucune saison active : rien de ce qui suit n'est calculable (référentiels,
    // reçus, tarifs dépendent tous de saison.id). L'interface affiche un
    // message propre à la place du registre, de Finance, du suivi journalier
    // et des paiements — un administrateur doit créer et activer une saison.
    return {
      utilisateur,
      estAdministrateur: utilisateur ? source.session.estAdministrateur(utilisateur) : false,
      saisonIndisponible: true,
      saison: { id: '', nom: '', reductionMaxCentimes: 0, duree: '', active: false },
      hotels: [],
      vols: [],
      chambres: [],
      rabatteurs: [],
      tarifs: [],
      recus: [],
      operations: [],
      imagesOperations: {},
      portraitsPasseport: {},
      audit: [],
      modeDemonstration: modeDemonstration(),
    }
  }

  const [hotels, vols, chambres, rabatteurs, tarifs, recus, operations, audit] = await Promise.all([
    source.referentiels.hotels(),
    source.referentiels.vols(),
    source.referentiels.chambres(),
    source.referentiels.rabatteurs(),
    source.referentiels.tarifs(saison.id),
    // reprise.md §5.3 — un écran ne mélange jamais les saisons.
    source.recus.lister({ inclureAnnules: true, saisonId: saison.id }),
    source.operationsPartagees.lister(saison.id),
    source.audit.lister(200),
  ])

  // R-42 — migration au chargement, comme le fichier de référence la fait à
  // l'ouverture : une image restée sur un versement partagé remonte vers son
  // opération.
  for (const migration of migrationsImagesPartagees(recus, operations)) {
    await source.operationsPartagees.definirImage(migration.operationId, migration.image)
    await source.recus.definirImageVersement(migration.recuId, migration.versementId, null)
    const cible = operations.find((o) => o.id === migration.operationId)
    if (cible) cible.image = migration.image
  }

  const imagesOperations: Record<string, string> = {}
  for (const operation of operations) {
    if (operation.image) imagesOperations[operation.id] = await urlImage(source, operation.image)
  }

  const portraitsPasseport: Record<string, string> = {}
  for (const recu of recus) {
    const portrait = recu.passeport?.imagePortrait
    if (portrait) portraitsPasseport[recu.id] = await urlImage(source, portrait)
  }

  return {
    utilisateur,
    estAdministrateur: utilisateur ? source.session.estAdministrateur(utilisateur) : false,
    saisonIndisponible: false,
    saison,
    hotels,
    vols,
    chambres,
    rabatteurs,
    tarifs,
    recus,
    operations,
    imagesOperations,
    portraitsPasseport,
    audit,
    modeDemonstration: modeDemonstration(),
  }
}

async function contexteCommun(source: SourceDonnees) {
  const maintenant = source.horloge.maintenant()
  const utilisateur = await source.session.utilisateurCourant()
  const saison = await source.referentiels.saisonActive()
  return {
    maintenant,
    utilisateur,
    saison,
    tarifs: await source.referentiels.tarifs(saison.id),
    // reprise.md §5.3 — un écran ne mélange jamais les saisons.
    operations: await source.operationsPartagees.lister(saison.id),
    // Décision de performance (2026-08-09) : seuls les versements (à plat)
    // servent à `etatOperation` (disponible d'une opération partagée) — plus
    // jamais un chargement complet de tous les reçus de la saison à chaque
    // écriture (création, versement, correction).
    versements: (await source.versementsSaison.lister(saison.id)).map((v) => v.versement),
    horodatage: horodatage(maintenant),
    date: dateDuJour(maintenant),
    heure: heureCourante(maintenant),
    employe: utilisateur?.nom ?? '—',
  }
}

/** R-01 à R-14 — Crée un reçu après validation par le noyau métier. */
export async function creerRecu(
  saisie: SaisieNouveauRecu,
  depassementConfirme = false,
): Promise<Resultat<{ recuId: string; numero: number }>> {
  const source = sourceDonnees()
  let base: Awaited<ReturnType<typeof contexteCommun>>
  try {
    base = await contexteCommun(source)
  } catch (erreurSaison) {
    if (!(erreurSaison instanceof SaisonIndisponibleError)) throw erreurSaison
    return { statut: 'erreurs', erreurs: [{ champ: 'saison', code: 'saison-indisponible' }] }
  }

  const clientId = source.identifiants.nouvelId('client')

  const contexte: ContexteCreation = {
    operations: base.operations,
    versements: base.versements,
    nouvelIdOperation: () => source.identifiants.nouvelId('SOP'),
    horodatage: base.horodatage,
    employe: base.employe,
    tarifs: base.tarifs,
    reductionMaxCentimes: base.saison.reductionMaxCentimes,
    // P08 — le numéro n'étant utilisé qu'en fin de validation (voir
    // `preparerCreationRecu`), un espace réservé suffit ici : la réservation
    // réelle n'a lieu qu'après validation, ci-dessous.
    numero: 0,
    clientId,
    idVersement: source.identifiants.nouvelId('versement'),
    date: base.date,
    heure: base.heure,
    depassementConfirme,
  }

  const resultat = preparerCreationRecu(saisie, contexte)
  if (resultat.statut !== 'ok') return resultat

  // R-11, P08 — le numéro est réservé sur la séquence après validation, jamais
  // avant : un abandon ne doit consommer aucun numéro.
  const numero = await source.recus.reserverNumero()

  const { donnees: donneesValidees, nouvelleOperation } = resultat.valeur as ResultatCreation
  const donnees = { ...donneesValidees, numero }

  let recu: Recu
  try {
    if (nouvelleOperation) await source.operationsPartagees.creer(nouvelleOperation)

    // R-13 — le client est créé et rattaché au reçu.
    await source.clients.creer({
      id: clientId,
      nom: donnees.nom,
      prenom: donnees.prenom,
      photoUrl: '',
      passeport: donnees.passeport,
      creeLe: base.horodatage,
      creePar: base.employe,
      recuIds: [],
    })

    recu = await source.recus.creer(donnees, depassementConfirme)
    await source.clients.rattacherRecu(clientId, recu.id)
  } catch (erreurEcriture) {
    // Filet de sécurité : une RPC inattendue ne doit jamais bloquer la
    // fenêtre sans message (voir RAPPORT-CHANTIER.md, modifierRecu()).
    console.error('creerRecu — échec inattendu de l’écriture :', erreurEcriture)
    return { statut: 'erreurs', erreurs: [{ champ: 'section', code: 'erreur-inattendue-creation' }] }
  }

  await tracer(
    source,
    'إنشاء',
    `وصل ${recu.numero} — ${donnees.prenom} ${donnees.nom} — ` +
      centimesEnTexteDevise(donnees.premierVersement.montantCentimes),
    base.utilisateur,
  )

  return ok({ recuId: recu.id, numero: recu.numero })
}

/** R-15 à R-22 — Ajoute un versement à un reçu existant. */
export async function ajouterVersement(
  saisie: SaisieVersement,
  depassementConfirme = false,
): Promise<Resultat<{ recuId: string }>> {
  const source = sourceDonnees()
  let base: Awaited<ReturnType<typeof contexteCommun>>
  try {
    base = await contexteCommun(source)
  } catch (erreurSaison) {
    if (!(erreurSaison instanceof SaisonIndisponibleError)) throw erreurSaison
    return { statut: 'erreurs', erreurs: [{ champ: 'saison', code: 'saison-indisponible' }] }
  }

  // reprise.md §5.3 — un clic « ajouter un paiement » sur une ligne du registre
  // transmet et verrouille `recuId` : l'identifiant réel du reçu tranche, le
  // numéro seul ne suffit pas puisque deux saisons peuvent chacune porter un
  // reçu n°1. La recherche manuelle par numéro (bouton du haut) reste limitée
  // à la saison active.
  const numero = Number(saisie.numeroRecu)
  const recu = saisie.recuId
    ? await source.recus.parId(saisie.recuId)
    : Number.isFinite(numero)
      ? await source.recus.parNumero(numero, base.saison.id)
      : null

  const resultat = preparerVersement(saisie, recu, {
    operations: base.operations,
    versements: base.versements,
    nouvelIdOperation: () => source.identifiants.nouvelId('SOP'),
    horodatage: base.horodatage,
    employe: base.employe,
    idVersement: source.identifiants.nouvelId('versement'),
    date: base.date,
    heure: base.heure,
    depassementConfirme,
  })
  if (resultat.statut !== 'ok') return resultat

  const { versement, nouvelleOperation } = resultat.valeur
  const cible = recu as Recu
  try {
    if (nouvelleOperation) await source.operationsPartagees.creer(nouvelleOperation)
    await source.recus.ajouterVersement(cible.id, versement, depassementConfirme)
  } catch (erreurEcriture) {
    // Filet de sécurité : une RPC inattendue ne doit jamais bloquer la
    // fenêtre sans message (voir RAPPORT-CHANTIER.md, modifierRecu()).
    console.error('ajouterVersement — échec inattendu de l’écriture :', erreurEcriture)
    return { statut: 'erreurs', erreurs: [{ champ: 'montant', code: 'erreur-inattendue-versement' }] }
  }

  await tracer(
    source,
    'دفعة',
    `وصل ${cible.numero} — دفعة ${versement.rang} — ` +
      centimesEnTexteDevise(versement.montantCentimes),
    base.utilisateur,
  )

  return ok({ recuId: cible.id })
}

/** R-43 à R-47 — Annule un reçu sans jamais le supprimer. */
export async function annulerRecu(
  recuId: string,
  saisie: SaisieAnnulation,
): Promise<Resultat<null>> {
  const source = sourceDonnees()
  let base: Awaited<ReturnType<typeof contexteCommun>>
  try {
    base = await contexteCommun(source)
  } catch (erreurSaison) {
    if (!(erreurSaison instanceof SaisonIndisponibleError)) throw erreurSaison
    return { statut: 'erreurs', erreurs: [{ champ: 'saison', code: 'saison-indisponible' }] }
  }
  const recu = await source.recus.parId(recuId)
  if (!recu) return { statut: 'erreurs', erreurs: [{ champ: 'motif', code: 'numero-recu-introuvable' }] }

  // R-44 — la vérification du mot de passe est déléguée : aucun secret ne
  // traverse le domaine.
  const identiteVerifiee = saisie.motDePasse
    ? await source.session.verifierIdentite(saisie.motDePasse)
    : false

  const resultat = preparerAnnulation(saisie, recu, {
    employe: base.employe,
    horodatage: base.horodatage,
    date: base.date,
    heure: base.heure,
    jour: cleJour(base.maintenant),
    idMouvement: source.identifiants.nouvelId('mouvement'),
    identiteVerifiee,
  })
  if (resultat.statut !== 'ok') return resultat

  const { donnees, mouvementCaisse } = resultat.valeur
  try {
    await source.recus.annuler(recuId, donnees)
  } catch (erreurEcriture) {
    // Filet de sécurité : une RPC inattendue ne doit jamais bloquer la
    // fenêtre sans message (voir RAPPORT-CHANTIER.md, modifierRecu()).
    console.error('annulerRecu — échec inattendu de l’écriture :', erreurEcriture)
    return { statut: 'erreurs', erreurs: [{ champ: 'motif', code: 'erreur-inattendue-annulation' }] }
  }
  // La sortie de caisse réelle est déjà actée par `cancel_billing_receipt`
  // (RPC omra, `cash_register_movements`) au moment de l'appel précédent.
  // `mouvementsCaisse.creer` alimente uniquement le journal financier du
  // prototype (Finance/Suivi, fusion.md §5 — lot non câblé côté omra) : son
  // indisponibilité ne doit jamais annuler ou faire échouer une annulation de
  // reçu déjà actée en base.
  if (mouvementCaisse) {
    try {
      await source.mouvementsCaisse.creer(mouvementCaisse)
    } catch {
      // Intentionnellement ignoré — voir commentaire ci-dessus.
    }
  }

  await tracer(
    source,
    'إلغاء',
    `وصل ${recu.numero} — ${donnees.motif} — ` +
      (donnees.modeRemboursement === 'cash' ? 'من الصندوق' : 'خارج الصندوق'),
    base.utilisateur,
  )

  return ok(null)
}

/**
 * Partie commune à `previsualiserModification` et `modifierRecu` : lecture
 * fraîche de la saison/du reçu (jamais l'état déjà en mémoire côté écran,
 * qui peut dater de plusieurs secondes) puis validation pure du domaine.
 * N'écrit jamais — `modifierRecu` seul poursuit vers l'écriture.
 */
async function construireApercuModification(
  recuId: string,
  saisie: SaisieModification,
  depassementConfirme: boolean,
): Promise<
  Resultat<{
    source: SourceDonnees
    base: Awaited<ReturnType<typeof contexteCommun>>
    recu: Recu
    resultat: ResultatModification
  }>
> {
  const source = sourceDonnees()
  let base: Awaited<ReturnType<typeof contexteCommun>>
  try {
    base = await contexteCommun(source)
  } catch (erreurSaison) {
    if (!(erreurSaison instanceof SaisonIndisponibleError)) throw erreurSaison
    return { statut: 'erreurs', erreurs: [{ champ: 'saison', code: 'saison-indisponible' }] }
  }
  const recu = await source.recus.parId(recuId)
  if (!recu) return { statut: 'erreurs', erreurs: [{ champ: 'section', code: 'numero-recu-introuvable' }] }

  const estAdministrateur = base.utilisateur
    ? source.session.estAdministrateur(base.utilisateur)
    : false

  const resultat = preparerModification(saisie, recu, {
    tarifs: base.tarifs,
    reductionMaxCentimes: base.saison.reductionMaxCentimes,
    estAdministrateur,
    nouvelIdOperation: () => source.identifiants.nouvelId('SOP'),
    horodatage: base.horodatage,
    employe: base.employe,
    operations: base.operations,
    versements: base.versements,
    depassementConfirme,
  })
  if (resultat.statut !== 'ok') return resultat

  return ok({ source, base, recu, resultat: resultat.valeur })
}

/**
 * Précision du commanditaire (2026-08-09) : avant d'enregistrer, l'écran
 * doit montrer la fiche complète du reçu — avant/après, tous les champs, pas
 * seulement ceux touchés. Lecture fraîche, exactement comme `modifierRecu` :
 * l'aperçu ne peut jamais accepter quelque chose que l'écriture réelle
 * refuserait. N'écrit jamais ; `apercuApresModification` (domaine) construit
 * la fiche « après » à partir du reçu frais et du résultat validé.
 */
export async function previsualiserModification(
  recuId: string,
  saisie: SaisieModification,
  depassementConfirme = false,
): Promise<Resultat<{ avant: Recu; resultat: ResultatModification }>> {
  const prepare = await construireApercuModification(recuId, saisie, depassementConfirme)
  if (prepare.statut !== 'ok') return prepare
  return ok({ avant: prepare.valeur.recu, resultat: prepare.valeur.resultat })
}

/** R-49 à R-55 — Modifie une seule section d'un reçu. */
export async function modifierRecu(
  recuId: string,
  saisie: SaisieModification,
  depassementConfirme = false,
): Promise<Resultat<null>> {
  const prepare = await construireApercuModification(recuId, saisie, depassementConfirme)
  if (prepare.statut !== 'ok') return prepare
  const { source, base, recu, resultat } = prepare.valeur

  const { section, sectionLibelle, motif, changements, champsModifies, premierVersementCorrige } =
    resultat

  const modification: Modification = {
    id: source.identifiants.nouvelId('modification'),
    section,
    sectionLibelle,
    changements,
    motif,
    employe: base.employe,
    dateHeure: base.horodatage,
  }

  // P01 — le premier versement se corrige par sa propre méthode de port,
  // `champsModifies` ne pouvant pas exprimer une mutation de versement.
  try {
    if (premierVersementCorrige) {
      await source.recus.corrigerPremierVersement(
        recuId,
        premierVersementCorrige.versement,
        premierVersementCorrige.nouvelleOperation,
        modification,
        depassementConfirme,
      )
    } else {
      await source.recus.appliquerModification(recuId, champsModifies, modification)
    }
  } catch (erreurSection) {
    if (erreurSection instanceof SectionIndisponibleError) {
      return { statut: 'erreurs', erreurs: [{ champ: 'section', code: 'section-indisponible' }] }
    }
    // Filet de sécurité : une RPC peut refuser une écriture pour une raison
    // qui n'est pas (encore) reconnue ici — ex. aucune donnée réellement
    // changée. Sans ce filet, la fenêtre de modification restait bloquée
    // sans aucun message (voir RAPPORT-CHANTIER.md). L'erreur réelle reste
    // journalisée côté serveur pour le diagnostic.
    console.error('modifierRecu — échec inattendu de l’écriture :', erreurSection)
    return { statut: 'erreurs', erreurs: [{ champ: 'section', code: 'erreur-inattendue' }] }
  }

  const resume = changements
    .map((c) => `${c.champ} : ${c.ancienne || '—'} → ${c.nouvelle || '—'}`)
    .join(' · ')
  await tracer(
    source,
    'تعديل',
    `وصل ${recu.numero} — ${sectionLibelle} — ${resume} — السبب: ${motif}`,
    base.utilisateur,
  )

  return ok(null)
}

/** R-84 — Comptabilise une impression du reçu. */
export async function enregistrerImpressionRecu(recuId: string): Promise<Resultat<null>> {
  const source = sourceDonnees()
  const utilisateur = await source.session.utilisateurCourant()
  const recu = await source.recus.parId(recuId)
  if (!recu) return { statut: 'erreurs', erreurs: [{ champ: 'recu', code: 'numero-recu-introuvable' }] }

  const total = await source.recus.incrementerImpressions(recuId)
  await tracer(source, 'طباعة', `وصل ${recu.numero} — طباعة رقم ${total}`, utilisateur)
  return ok(null)
}

// ---------------------------------------------------------------------------
// Journal financier — lot L4
// ---------------------------------------------------------------------------

/** Une ligne du journal, prête à être affichée. */
export interface LigneJournal {
  id: string
  recuId: string
  heure: string
  date: string
  numeroRecu: number
  badge: string
  premierVersement: boolean
  client: string
  especes: string
  banque: string
  codeMode: string
  valeurReelle: string
  infosInstrument: string
  employe: string
  rabatteur: string
  hotel: string
  chambre: string
  vol: string
  convenu: string
  restant: string
  statut: string
  /** R-63 — la ligne est apparue après la dernière impression. */
  anomalie: boolean
}

/** Une ligne d'annulation, présentée séparément (R-60). */
export interface LigneAnnulation {
  id: string
  heure: string
  date: string
  numeroRecu: number
  client: string
  especes: string
  banque: string
  codeMode: string
  valeurReelle: string
  infosInstrument: string
  employe: string
  rabatteur: string
  hotel: string
  chambre: string
  vol: string
  convenu: string
}

/**
 * Une ligne de modification, présentée séparément — même emplacement que
 * les annulations (R-60), sous le tableau principal. Demande du
 * commanditaire (2026-08-09) : le détail (`changements`) doit être visible,
 * pas seulement le fait qu'une modification a eu lieu.
 */
export interface LigneModification {
  id: string
  heure: string
  date: string
  numeroRecu: number
  client: string
  sectionLibelle: string
  changements: ChangementChamp[]
  motif: string
  employe: string
}

export interface JournalFinancier {
  periode: PeriodeFinance
  libellePeriode: string
  jourSelectionne: string | null
  lignes: LigneJournal[]
  annulations: LigneAnnulation[]
  totaux: TotauxFinance
  nouveauxClients: number
  dernierRecu: string
  chequesSansImage: number
  modifications: number
  /** 2026-08-09 — le détail derrière le compte `modifications` ci-dessus. */
  modificationsListe: LigneModification[]
  nombreAnnulations: number
  totalAnnule: string
  /** R-62 */
  nombreImpressions: number
  codeImpression: string
  /** R-62 — code repris dans le bandeau supérieur de l'impression. */
  codeImpressionBandeau: string
  /** R-63, R-65 */
  anomaliesEnAttente: string[]
  /** R-66 */
  etatVeille: string
  symboleEtat: string
  couleurEtat: string
  /** R-61 */
  peutImprimer: boolean
  /** R-67 */
  nombrePages: number
  estAdministrateur: boolean
}

function libellePeriode(periode: PeriodeFinance, maintenant: Date): string {
  if (periode.filtre === 'day') {
    return dateFrDepuisCleJour(periode.jour || cleJour(maintenant))
  }
  if (periode.filtre === 'weekend') {
    const { debut, fin } = bornesWeekEnd(maintenant)
    return `${dateFrDepuisCleJour(debut)} إلى ${dateFrDepuisCleJour(fin)}`
  }
  if (periode.filtre === 'custom') {
    if (!periode.du && !periode.au) return 'اختر فترة'
    return `${dateFrDepuisCleJour(periode.du || periode.au!)} إلى ${dateFrDepuisCleJour(periode.au || periode.du!)}`
  }
  return 'كل الفترات'
}

/** Construit le journal financier pour une période. */
export async function journalFinancier(periode: PeriodeFinance): Promise<JournalFinancier> {
  const source = sourceDonnees()
  const maintenant = source.horloge.maintenant()
  const utilisateur = await source.session.utilisateurCourant()
  const estAdministrateur = utilisateur ? source.session.estAdministrateur(utilisateur) : false
  const saison = await source.referentiels.saisonActive()

  // reprise.md §5.3 — un écran ne mélange jamais les saisons.
  const versementsSaison = await source.versementsSaison.lister(saison.id)
  const modificationsSaison = await source.modificationsSaison.lister(saison.id)
  const mouvementsCaisse = await source.mouvementsCaisse.lister(saison.id)
  const operations = await source.operationsPartagees.lister(saison.id)

  const tous = collecterMouvements(versementsSaison)
  const retenus = trierMouvements(tous.filter((m) => dansLaPeriode(m.jour, periode, maintenant)))

  const remboursements = mouvementsCaisse.filter(
    (m) => m.type === 'refund_cash' && dansLaPeriode(m.jour, periode, maintenant),
  )

  const jourSelectionne = periode.filtre === 'day' ? periode.jour || cleJour(maintenant) : null

  // R-63, R-64, R-65
  let anomalies: string[] = []
  let nombreImpressions = 0
  if (jourSelectionne) {
    const impressions = await source.impressionsFinance.listerParJour(jourSelectionne, saison.id)
    nombreImpressions = impressions.length
    const idsDuJour = [
      ...tous.filter((m) => m.jour === jourSelectionne).map((m) => m.id),
      ...mouvementsCaisse.filter((m) => m.jour === jourSelectionne).map((m) => m.id),
    ].sort()
    const acquittement = await source.acquittementsAnomalie.parJour(jourSelectionne, saison.id)
    anomalies = anomaliesEnAttente(anomaliesCandidates(impressions, idsDuJour), acquittement)
  }

  const anomaliePendante = estAdministrateur && anomalies.length > 0

  // R-66 — état de la veille.
  let etatDeLaVeille = '✓'
  if (jourSelectionne) {
    const veille = decalerCleJour(jourSelectionne, -1)
    const impressionsVeille = await source.impressionsFinance.listerParJour(veille, saison.id)
    const idsVeille = [
      ...tous.filter((m) => m.jour === veille).map((m) => m.id),
      ...mouvementsCaisse.filter((m) => m.jour === veille).map((m) => m.id),
    ].sort()
    const acquittementVeille = await source.acquittementsAnomalie.parJour(veille, saison.id)
    etatDeLaVeille = etatVeille(
      anomaliesEnAttente(anomaliesCandidates(impressionsVeille, idsVeille), acquittementVeille),
    )
  }

  const lignes: LigneJournal[] = retenus.map((mouvement) => {
    const { recu, versement, index, nature } = mouvement
    const instantane = versement.instantane
    const estBancaire = nature === NATURE_CHEQUE || nature === NATURE_VIREMENT
    return {
      id: mouvement.id,
      recuId: recu.id,
      heure: mouvement.heure,
      date: versement.date || '—',
      numeroRecu: recu.numero,
      badge: badgeVersement(index),
      premierVersement: index === 0,
      client: instantane.client || `${recu.prenom} ${recu.nom}`,
      especes: nature === NATURE_ESPECES ? centimesEnTexte(versement.montantCentimes) : '—',
      banque: estBancaire ? centimesEnTexte(versement.montantCentimes) : '—',
      codeMode: codeMode(versement),
      valeurReelle:
        estBancaire && versement.montantOperationCentimes > 0
          ? centimesEnTexte(versement.montantOperationCentimes)
          : '—',
      infosInstrument: estBancaire
        ? `${versement.banque || '—'} / ${versement.referenceInstrument || '—'}`
        : '—',
      employe: versement.enregistrePar || recu.employe || '—',
      rabatteur: instantane.rabatteur || recu.rabatteur || '—',
      hotel: instantane.hotel || recu.hotel || '—',
      chambre: instantane.chambre || recu.chambre || '—',
      vol: instantane.vol || recu.vol || '—',
      convenu: centimesEnTexte(instantane.convenuCentimes ?? recu.convenuCentimes),
      restant: centimesEnTexte(instantane.restantApresCentimes),
      statut: instantane.statutApres,
      anomalie: anomaliePendante && anomalies.includes(mouvement.id),
    }
  })

  // R-60 — lignes d'annulation. Les annulations sont rares (pas le volume
  // qui pose problème, contrairement aux versements) : un chargement complet
  // limité aux SEULS reçus annulés de la saison reste proportionné, jamais
  // les 500 reçus pour n'en garder qu'une poignée.
  const recusLeger = await source.recus.listerLeger({ inclureAnnules: true, saisonId: saison.id })
  const idsAnnules = recusLeger.filter((r) => r.statut === 'ملغى').map((r) => r.id)
  const recusAnnulesComplets = (
    await Promise.all(idsAnnules.map((id) => source.recus.parId(id)))
  ).filter((r): r is Recu => r !== null)
  const annulees = annulationsDeLaPeriode(recusAnnulesComplets, periode, maintenant)
  const annulations: LigneAnnulation[] = annulees.map((recu) => {
    const natures = [...new Set(recu.versements.map((v) => natureNormalisee(v.nature)))]
    const especes = recu.versements
      .filter((v) => natureNormalisee(v.nature) === NATURE_ESPECES)
      .reduce((s, v) => s + v.montantCentimes, 0)
    const banque = recu.versements
      .filter((v) => natureNormalisee(v.nature) !== NATURE_ESPECES)
      .reduce((s, v) => s + v.montantCentimes, 0)
    const reel = Math.max(0, ...recu.versements.map((v) => v.montantOperationCentimes))
    const infos = [
      ...new Set(
        recu.versements
          .filter((v) => natureNormalisee(v.nature) !== NATURE_ESPECES)
          .map((v) => `${v.banque || '—'} / ${v.referenceInstrument || '—'}`),
      ),
    ]
    const route = recu.modeRemboursement === 'cash' ? 'من الصندوق' : 'خارج الصندوق'
    return {
      id: recu.id,
      heure: heureDepuisHorodatage(recu.annuleLe) || '—',
      date: dateFrDepuisHorodatage(recu.annuleLe) || '—',
      numeroRecu: recu.numero,
      client: `${recu.prenom} ${recu.nom}`,
      especes: especes ? centimesEnTexte(especes) : '—',
      banque: banque ? centimesEnTexte(banque) : '—',
      codeMode: natures
        .map((n) => (n === NATURE_ESPECES ? 'E' : n === NATURE_VIREMENT ? 'V' : 'CH'))
        .join('/'),
      valeurReelle: reel ? centimesEnTexte(reel) : '—',
      infosInstrument: `${route} / ${infos.length ? infos.join(' · ') : recu.motifAnnulation || '—'}`,
      employe: recu.annulePar || recu.employe || '—',
      rabatteur: recu.rabatteur || '—',
      hotel: recu.hotel || '—',
      chambre: recu.chambre || '—',
      vol: recu.vol || '—',
      convenu: centimesEnTexte(recu.convenuCentimes),
    }
  })

  const totaux = totauxFinance(retenus, remboursements)

  const chequesSansImage = operations.filter((operation) => {
    if (natureNormalisee(operation.nature) !== NATURE_CHEQUE) return false
    if (operation.image) return false
    return retenus.some((m) => m.versement.operationPartageeId === operation.id)
  }).length

  const modificationsPeriode = modificationsSaison.filter((evenement) =>
    dansLaPeriode(
      cleJourDepuisDateFr(dateFrDepuisHorodatage(evenement.survenuLe)),
      periode,
      maintenant,
    ),
  )
  const modifications = modificationsPeriode.length
  const modificationsListe: LigneModification[] = modificationsPeriode.map((evenement) => ({
    id: evenement.id,
    heure: heureDepuisHorodatage(evenement.survenuLe) || '—',
    date: dateFrDepuisHorodatage(evenement.survenuLe) || '—',
    numeroRecu: evenement.recuNumero,
    client: `${evenement.prenom} ${evenement.nom}`,
    sectionLibelle: evenement.sectionLibelle,
    changements: evenement.changements,
    motif: evenement.motif,
    employe: evenement.employe,
  }))

  const aujourdhui = cleJour(maintenant)
  const hier = decalerCleJour(aujourdhui, -1)
  const etat = etatImpression({
    anomalieEnAttente: anomaliePendante,
    estAujourdhui: jourSelectionne === aujourdhui,
  })

  return {
    periode,
    libellePeriode: libellePeriode(periode, maintenant),
    jourSelectionne,
    lignes,
    annulations,
    totaux,
    nouveauxClients: retenus.filter((m) => m.index === 0).length,
    dernierRecu: retenus.length
      ? String(Math.max(...retenus.map((m) => m.recu.numero)))
      : '—',
    chequesSansImage,
    modifications,
    modificationsListe,
    nombreAnnulations: annulees.length,
    // Bloc de synthèse : le fichier de référence y emploie `dhs()`, donc avec
    // la devise. Seules les cellules du tableau emploient `dh()`, sans devise.
    totalAnnule: centimesEnTexteDevise(totalAnnuleCentimes(annulees)),
    nombreImpressions,
    codeImpression: codeImpression(nombreImpressions),
    codeImpressionBandeau: codeImpressionBandeau(nombreImpressions),
    anomaliesEnAttente: anomalies,
    etatVeille: etatDeLaVeille,
    symboleEtat: etat.symbole,
    couleurEtat: etat.couleur,
    peutImprimer: peutImprimer({
      jour: jourSelectionne,
      aujourdhui,
      hier,
      estAdministrateur,
    }),
    nombrePages: nombreDePages(lignes.length + annulations.length),
    estAdministrateur,
  }
}

/** R-61, R-62 — Enregistre une impression du journal. */
export async function enregistrerImpressionFinance(
  jour: string,
): Promise<Resultat<{ numeroImpression: number }>> {
  const source = sourceDonnees()
  const maintenant = source.horloge.maintenant()
  const utilisateur = await source.session.utilisateurCourant()
  const estAdministrateur = utilisateur ? source.session.estAdministrateur(utilisateur) : false

  const aujourdhui = cleJour(maintenant)
  const hier = decalerCleJour(aujourdhui, -1)

  // R-61 — un employé ne peut imprimer que la journée courante ou la veille.
  if (!peutImprimer({ jour, aujourdhui, hier, estAdministrateur })) {
    return {
      statut: 'erreurs',
      erreurs: [{ champ: 'jour', code: 'impression-hors-periode-autorisee' }],
    }
  }

  // reprise.md §5.3 — un écran ne mélange jamais les saisons.
  const saison = await source.referentiels.saisonActive()
  const versementsSaison = await source.versementsSaison.lister(saison.id)
  const mouvementsCaisse = await source.mouvementsCaisse.lister(saison.id)
  const impressions = await source.impressionsFinance.listerParJour(jour, saison.id)

  const mouvementIds = [
    ...collecterMouvements(versementsSaison)
      .filter((m) => m.jour === jour)
      .map((m) => m.id),
    ...mouvementsCaisse.filter((m) => m.jour === jour).map((m) => m.id),
  ].sort()

  const numeroImpression = impressions.length + 1
  await source.impressionsFinance.creer(
    {
      id: source.identifiants.nouvelId('impression'),
      jour,
      imprimeLe: horodatage(maintenant),
      employe: utilisateur?.nom ?? '—',
      numeroImpression,
      mouvementIds,
      nombreLignes: mouvementIds.length,
    },
    saison.id,
  )

  await tracer(
    source,
    'طباعة الصندوق',
    `${dateFrDepuisCleJour(jour)} — ${String(numeroImpression).padStart(2, '0')} — ${mouvementIds.length} حركة`,
    utilisateur,
  )

  return ok({ numeroImpression })
}

/** R-65 — Acquitte les anomalies d'une journée. Réservé à l'administrateur. */
export async function acquitterAnomalies(jour: string): Promise<Resultat<null>> {
  const source = sourceDonnees()
  const utilisateur = await source.session.utilisateurCourant()
  const estAdministrateur = utilisateur ? source.session.estAdministrateur(utilisateur) : false

  if (!estAdministrateur) {
    return {
      statut: 'erreurs',
      erreurs: [{ champ: 'anomalie', code: 'acquittement-reserve-administrateur' }],
    }
  }

  const journal = await journalFinancier({ filtre: 'day', jour })
  if (!journal.anomaliesEnAttente.length) return ok(null)

  // reprise.md §5.3 — un écran ne mélange jamais les saisons.
  const saison = await source.referentiels.saisonActive()
  const maintenant = source.horloge.maintenant()
  const precedent = await source.acquittementsAnomalie.parJour(jour, saison.id)
  const tous = [
    ...new Set([...(precedent?.mouvementIds ?? []), ...journal.anomaliesEnAttente].map(String)),
  ].sort()

  await source.acquittementsAnomalie.acquitter(
    {
      jour,
      mouvementIds: tous,
      acquitteLe: horodatage(maintenant),
      acquittePar: utilisateur?.nom ?? '—',
    },
    saison.id,
  )

  await tracer(
    source,
    'مراجعة',
    `تأكيد مراجعة ${journal.anomaliesEnAttente.length} عملية — ${dateFrDepuisCleJour(jour)}`,
    utilisateur,
  )

  return ok(null)
}

// ---------------------------------------------------------------------------
// Lot L5 — Suivi journalier
// ---------------------------------------------------------------------------

/** Une ligne du suivi journalier, prête à afficher. */
export interface LigneJournee {
  cle: string
  /** Nom du jour, en français. */
  jour: string
  /** Date `jj/mm/aaaa`. */
  date: string
  especes: string
  total: string
  /** `n │ montant`, ou « — ». */
  cheques: string
  virements: string
  nouveauxClients: string
  annulations: string
  /** R-71 */
  weekEnd: boolean
  vide: boolean
  prefixeControle: string
  etatControle: string
  classeControle: string
}

export interface SuiviJournalier {
  mois: string
  /** R-68 — le fichier n'autorise pas d'aller au-delà du mois courant. */
  moisSuivantPossible: boolean
  lignes: LigneJournee[]
  /** R-70 — journées cochées, limitées au mois affiché. */
  selection: string[]
  toutesVisiblesSelectionnees: boolean
  afficherVides: boolean
  nombreAffichees: number
  nombreMasquees: number
  /** R-72 — totaux du périmètre retenu. */
  encaissements: string
  especes: string
  cheques: string
  virements: string
  nouveauxClients: number
  annulationsResume: string
  totalBancaire: string
  nombreOperationsBancaires: number
}

export interface OptionsSuiviJournalier {
  mois?: string
  selection?: readonly string[]
  afficherVides?: boolean
}

/** R-68 à R-72 — Construit le suivi journalier d'un mois. */
export async function suiviJournalier(
  options: OptionsSuiviJournalier = {},
): Promise<SuiviJournalier> {
  const source = sourceDonnees()
  const maintenant = source.horloge.maintenant()
  const mois = moisValide(options.mois, maintenant)
  const afficherVides = options.afficherVides !== false

  // reprise.md §5.3 — un écran ne mélange jamais les saisons.
  const saison = await source.referentiels.saisonActive()
  const recusSaison = await source.recus.listerLeger({ inclureAnnules: true, saisonId: saison.id })
  const versementsSaison = await source.versementsSaison.lister(saison.id)
  const modificationsSaison = await source.modificationsSaison.lister(saison.id)
  const operations = await source.operationsPartagees.lister(saison.id)
  const mouvementsCaisse = await source.mouvementsCaisse.lister(saison.id)

  // Les anomalies restantes sont précalculées : le domaine n'attend qu'une
  // lecture synchrone.
  const cles = joursDuMois(mois, maintenant)
  const impressionsParJour: ImpressionFinance[] = []
  const anomaliesParJour = new Map<string, number>()
  const tousMouvements = collecterMouvements(versementsSaison)

  for (const cle of cles) {
    const impressions = await source.impressionsFinance.listerParJour(cle, saison.id)
    if (!impressions.length) continue
    impressionsParJour.push(...impressions)
    const ids = [
      ...tousMouvements.filter((m) => m.jour === cle).map((m) => m.id),
      ...mouvementsCaisse.filter((m) => m.jour === cle).map((m) => m.id),
    ].sort()
    const acquittement = await source.acquittementsAnomalie.parJour(cle, saison.id)
    anomaliesParJour.set(
      cle,
      anomaliesEnAttente(anomaliesCandidates(impressions, ids), acquittement).length,
    )
  }

  const resumes = resumesDuMois(mois, maintenant, {
    recusSaison,
    versementsSaison,
    modificationsSaison,
    operations,
    mouvementsCaisse,
    impressions: impressionsParJour,
    anomaliesEnAttente: (cle) => anomaliesParJour.get(cle) ?? 0,
  })

  const selection = selectionDuMois(options.selection ?? [], mois)
  const visibles = journeesVisibles(resumes, afficherVides)
  const perimetre = perimetreDeCalcul(resumes, selection)
  const totaux = totauxJournees(perimetre)

  const lignes: LigneJournee[] = visibles.map((resume) => {
    const controle = etatControle(resume)
    const date = new Date(`${resume.cle}T12:00:00`)
    return {
      cle: resume.cle,
      jour: NOMS_JOURS[date.getDay()],
      date: dateFrDepuisCleJour(resume.cle),
      especes: centimesEnTexteDevise(resume.especesCentimes),
      total: centimesEnTexteDevise(totalJournee(resume)),
      cheques: resume.nombreCheques
        ? `${resume.nombreCheques} │ ${centimesEnTexteDevise(resume.chequesCentimes)}`
        : '—',
      virements: resume.nombreVirements
        ? `${resume.nombreVirements} │ ${centimesEnTexteDevise(resume.virementsCentimes)}`
        : '—',
      nouveauxClients: resume.nouveauxClients ? String(resume.nouveauxClients) : '—',
      annulations: resume.nombreAnnulations
        ? `${resume.nombreAnnulations} │ ${centimesEnTexteDevise(resume.annulationsCentimes)}`
        : '—',
      weekEnd: estWeekEnd(resume.cle),
      vide: !resume.active,
      prefixeControle: controle.prefixe,
      etatControle: controle.etat,
      classeControle: controle.classe,
    }
  })

  return {
    mois,
    moisSuivantPossible: mois < cleJour(maintenant).slice(0, 7),
    lignes,
    selection: [...selection],
    toutesVisiblesSelectionnees:
      visibles.length > 0 && visibles.every((resume) => selection.has(resume.cle)),
    afficherVides,
    nombreAffichees: visibles.length,
    nombreMasquees: resumes.length - visibles.length,
    encaissements: centimesEnTexteDevise(totaux.totalCentimes),
    especes: centimesEnTexteDevise(totaux.especesCentimes),
    cheques: `${totaux.nombreCheques} │ ${centimesEnTexteDevise(totaux.chequesCentimes)}`,
    virements: `${totaux.nombreVirements} │ ${centimesEnTexteDevise(totaux.virementsCentimes)}`,
    nouveauxClients: totaux.nouveauxClients,
    annulationsResume: `${totaux.nombreAnnulations} │ ${centimesEnTexteDevise(totaux.annulationsCentimes)}`,
    totalBancaire: centimesEnTexteDevise(totaux.bancaireCentimes),
    nombreOperationsBancaires: totaux.nombreOperationsBancaires,
  }
}

// ---------------------------------------------------------------------------
// Lot L5 — Registre des chèques et virements, et images
// ---------------------------------------------------------------------------

/** Une ligne du registre, prête à afficher. */
export interface LigneRegistre {
  cle: string
  /** URL affichable de l'image, résolue par le stockage de fichiers. */
  image: string
  alternativeImage: string
  titreAjoutImage: string
  dateEnregistrement: string
  montant: string
  /** `Chèque` ou `Virement`. */
  mode: string
  classeMode: 'cheque' | 'transfer'
  numero: string
  banque: string
  dateInstrument: string
  /** `Partagé` ou `Unique`. */
  type: string
  classeType: 'shared' | 'unique'
  /** R-73 — Le payeur n'est affiché que pour une opération partagée. */
  payeur: string
  payeurComplet: string
  clients: string
  clientsComplet: string
  recus: string
  recusComplet: string
  /** Numéros affichés un par un, pour la pastille de référence. */
  numerosRecus: string[]
  attribue: string
  restant: string
  couleurRestant: string
  employe: string
}

export interface AttributionAffichee {
  /** Identifiant du versement — un reçu peut porter plusieurs versements attribués à la même opération partagée. */
  versementId: string
  numeroRecu: number
  client: string
  montant: string
  situation: string
  annule: boolean
}

/** Contenu de la fenêtre de détail d'une opération. */
export interface DetailOperationBancaire {
  cle: string
  entete: string
  dateEnregistrement: string
  mode: string
  montant: string
  libelleReference: string
  numero: string
  banque: string
  libelleDate: string
  dateInstrument: string
  type: string
  payeur: string
  attribue: string
  restant: string
  couleurRestant: string
  employe: string
  clients: string
  recus: string
  image: string
  /**
   * Vrai quand une référence d'image existe en base pour cette opération
   * mais que le fichier n'a pas pu être chargé depuis le stockage — distinct
   * de « aucune image » (jamais déposée). Seul un administrateur peut la
   * supprimer (voir `suppressionPossible`, déjà indépendant de ce champ) pour
   * libérer la place d'un nouvel envoi.
   */
  imageIntrouvable: boolean
  alternativeImage: string
  texteSansImage: string
  imageDeposeeLe: string
  imageDeposeePar: string
  /** R-39 */
  suppressionPossible: boolean
  /** R-36 — l'ajout n'est proposé que si aucune image n'est présente. */
  ajoutPossible: boolean
  attributions: AttributionAffichee[]
}

export interface RegistreBancaire {
  filtres: FiltresRegistre
  lignes: LigneRegistre[]
  /** Montant global des opérations affichées. */
  montantGlobal: string
  nombreAffiche: number
  /** Libellé du pied de tableau. */
  libellePortee: string
  estAdministrateur: boolean
  detail: DetailOperationBancaire | null
}

async function operationsBancaires(source: SourceDonnees): Promise<OperationBancaire[]> {
  // reprise.md §5.3 — un écran ne mélange jamais les saisons.
  const saison = await source.referentiels.saisonActive()
  const versementsSaison = await source.versementsSaison.lister(saison.id)
  const operations = await source.operationsPartagees.lister(saison.id)
  return collecterOperationsBancaires(versementsSaison, operations)
}

/**
 * Résolution sûre d'une URL de justificatif : une image ORPHELINE (référence
 * connue en base, fichier introuvable dans le stockage — bucket vidé,
 * dépôt jamais finalisé, etc.) ne doit jamais faire planter l'écran qui
 * l'affiche (règle absolue). `''` couvre alors deux cas distingués par
 * l'appelant via la présence de la référence elle-même : « aucune image »
 * (`image` était déjà `null`) et « image introuvable » (`image` existe mais
 * ceci a échoué) — jamais confondus dans l'affichage.
 */
async function urlImage(
  source: SourceDonnees,
  image: ReferenceFichier | null,
): Promise<string> {
  if (!image) return ''
  try {
    return await source.fichiers.url(image)
  } catch (erreur) {
    console.error('Image justificative introuvable dans le stockage :', erreur)
    return ''
  }
}

/** R-73 à R-77 — Construit le registre des chèques et virements. */
export async function registreBancaire(
  filtresDemandes: Partial<FiltresRegistre> = {},
  cleSelectionnee: string | null = null,
): Promise<RegistreBancaire> {
  const source = sourceDonnees()
  const utilisateur = await source.session.utilisateurCourant()
  const estAdministrateur = utilisateur ? source.session.estAdministrateur(utilisateur) : false

  const filtres: FiltresRegistre = {
    date: filtresDemandes.date ?? '',
    recherche: filtresDemandes.recherche ?? '',
    mode: filtresDemandes.mode ?? 'all',
    type: filtresDemandes.type ?? 'all',
    image: filtresDemandes.image ?? 'all',
  }

  const toutes = await operationsBancaires(source)
  const retenues = filtrerOperations(toutes, filtres)

  const lignes: LigneRegistre[] = []
  for (const operation of retenues) {
    const libelles = libellesInstrument(operation.nature)
    lignes.push({
      cle: operation.cle,
      image: await urlImage(source, operation.image),
      alternativeImage: libelles.alternativeImage,
      titreAjoutImage: libelles.titreAjout,
      dateEnregistrement: operation.dateEnregistrement,
      montant: centimesEnTexteDevise(operation.montantCentimes),
      mode: instrumentEnFrancais(operation.nature),
      classeMode: operation.nature === NATURE_VIREMENT ? 'transfer' : 'cheque',
      numero: operation.numero,
      banque: operation.banque,
      dateInstrument: operation.dateInstrument,
      type: operation.type,
      classeType: operation.partagee ? 'shared' : 'unique',
      payeur: operation.partagee ? operation.payeur || '—' : '—',
      payeurComplet: operation.partagee ? operation.payeur || '—' : '',
      clients:
        operation.clients.length > 1
          ? `${operation.clients.length} clients`
          : operation.clients[0] || '—',
      clientsComplet: operation.clients.join(' · ') || '—',
      recus:
        operation.recus.length > 3
          ? `${operation.recus.slice(0, 3).join(' · ')}…`
          : operation.recus.join(' · '),
      recusComplet: operation.recus.join(' · '),
      numerosRecus: operation.recus.slice(0, 3).map(String),
      attribue: centimesEnTexteDevise(operation.attribueCentimes),
      restant: restantNul(operation.restantCentimes)
        ? '—'
        : centimesEnTexteDevise(operation.restantCentimes),
      couleurRestant: couleurRestant(operation.restantCentimes),
      employe: operation.employe,
    })
  }

  const selectionnee = cleSelectionnee ? (toutes.find((x) => x.cle === cleSelectionnee) ?? null) : null

  return {
    filtres,
    lignes,
    montantGlobal: centimesEnTexteDevise(montantGlobalCentimes(retenues)),
    nombreAffiche: retenues.length,
    libellePortee: filtres.date
      ? `Paiements enregistrés le ${dateFrDepuisCleJour(filtres.date)}`
      : `Tous les paiements bancaires · ${toutes.length} opérations`,
    estAdministrateur,
    detail: selectionnee ? await construireDetail(source, selectionnee, estAdministrateur) : null,
  }
}

async function construireDetail(
  source: SourceDonnees,
  operation: OperationBancaire,
  estAdministrateur: boolean,
): Promise<DetailOperationBancaire> {
  const libelles = libellesInstrument(operation.nature)
  const imageUrl = await urlImage(source, operation.image)
  return {
    cle: operation.cle,
    entete: libelles.entete(operation.numero),
    dateEnregistrement: operation.dateEnregistrement,
    mode: instrumentEnFrancais(operation.nature),
    montant: centimesEnTexteDevise(operation.montantCentimes),
    libelleReference: libelles.libelleReference,
    numero: operation.numero,
    banque: operation.banque,
    libelleDate: libelles.libelleDate,
    dateInstrument: operation.dateInstrument,
    type: operation.type,
    payeur: operation.partagee ? operation.payeur || '—' : '—',
    attribue: centimesEnTexteDevise(operation.attribueCentimes),
    restant: restantNul(operation.restantCentimes)
      ? '—'
      : centimesEnTexteDevise(operation.restantCentimes),
    couleurRestant: couleurRestant(operation.restantCentimes),
    employe: operation.employe,
    clients: operation.clients.join(' · ') || '—',
    recus: operation.recus.join(' · ') || '—',
    image: imageUrl,
    imageIntrouvable: Boolean(operation.image) && !imageUrl,
    alternativeImage: libelles.alternativeImage,
    texteSansImage: libelles.sansImage,
    imageDeposeeLe: operation.image?.deposeLe || '—',
    imageDeposeePar: operation.image?.deposePar || '—',
    suppressionPossible: peutSupprimerImage(operation, estAdministrateur),
    ajoutPossible: !operation.image,
    // R-76 — répartition entre les reçus, avec la situation de chacun.
    attributions: operation.attributions.map((attribution) => ({
      versementId: attribution.versementId,
      numeroRecu: attribution.numeroRecu,
      client: attribution.client,
      montant: centimesEnTexteDevise(attribution.montantCentimes),
      situation: attribution.annule ? 'Reçu annulé' : 'Enregistré',
      annule: attribution.annule,
    })),
  }
}

/**
 * R-35, R-36, R-38, R-41 — Attache une image à une opération bancaire.
 *
 * L'image est déposée dans le stockage de fichiers ; seule sa référence est
 * conservée. Une opération partagée porte l'image sur l'opération, jamais sur
 * l'un de ses versements.
 */
export async function ajouterImageOperation(
  cle: string,
  fichier: { contenu: ArrayBuffer; nomOrigine: string; typeMime: string; origine?: string } | null,
): Promise<Resultat<null>> {
  const source = sourceDonnees()
  const utilisateur = await source.session.utilisateurCourant()

  if (!fichier) {
    return { statut: 'erreurs', erreurs: [{ champ: 'image', code: 'aucune-image-importee' }] }
  }

  const operation = (await operationsBancaires(source)).find((x) => x.cle === cle)
  if (!operation) {
    return {
      statut: 'erreurs',
      erreurs: [{ champ: 'operation', code: 'operation-bancaire-introuvable' }],
    }
  }

  // R-36 — une deuxième image est impossible.
  if (operation.image) {
    return { statut: 'erreurs', erreurs: [{ champ: 'image', code: 'image-deja-presente' }] }
  }

  let reference: ReferenceFichier
  try {
    reference = await source.fichiers.deposer({
      contenu: fichier.contenu,
      nomOrigine: fichier.nomOrigine,
      typeMime: fichier.typeMime,
      origine: fichier.origine ?? 'upload',
    })
  } catch (erreurDepot) {
    if (!(erreurDepot instanceof FormatImageNonAccepteError)) throw erreurDepot
    return { statut: 'erreurs', erreurs: [{ champ: 'image', code: 'format-image-non-accepte' }] }
  }
  const referenceSignee: ReferenceFichier = {
    ...reference,
    deposePar: utilisateur?.nom ?? '—',
  }

  if (operation.partagee && operation.operation) {
    await source.operationsPartagees.definirImage(operation.operation.id, referenceSignee)
  } else {
    await source.recus.definirImageVersement(
      operation.premierRecu.id,
      operation.premierVersement.id,
      referenceSignee,
    )
  }

  // R-41 — l'ajout est tracé au journal.
  await tracer(
    source,
    'Image paiement',
    `Ajout de l’image à ${instrumentEnFrancais(operation.nature).toLowerCase()} ${operation.numero}`,
    utilisateur,
  )

  return ok(null)
}

/**
 * R-38, R-42 — Attache une image au **dernier versement** d'un reçu.
 *
 * Utilisé par les formulaires de création et de versement : le fichier de
 * référence y garde l'image en brouillon et ne la rattache qu'à
 * l'enregistrement. L'opération visée est calculée comme dans le registre, si
 * bien qu'un versement partagé dépose l'image sur l'opération et non sur lui.
 */
export async function ajouterImageDernierVersement(
  recuId: string,
  fichier: { contenu: ArrayBuffer; nomOrigine: string; typeMime: string } | null,
): Promise<Resultat<null>> {
  const source = sourceDonnees()
  const recu = await source.recus.parId(recuId)
  if (!recu || !recu.versements.length) {
    return {
      statut: 'erreurs',
      erreurs: [{ champ: 'operation', code: 'operation-bancaire-introuvable' }],
    }
  }
  const cle = cleOperationBancaire(recu, recu.versements.length - 1)
  return ajouterImageOperation(cle, fichier)
}

/**
 * R-39, R-40, R-41 — Supprime l'image d'une opération.
 * Réservé à l'administrateur ; l'opération redevient ensuite sans image.
 */
export async function supprimerImageOperation(cle: string): Promise<Resultat<null>> {
  const source = sourceDonnees()
  const utilisateur = await source.session.utilisateurCourant()
  const estAdministrateur = utilisateur ? source.session.estAdministrateur(utilisateur) : false

  if (!estAdministrateur) {
    return {
      statut: 'erreurs',
      erreurs: [{ champ: 'image', code: 'suppression-image-reservee-administrateur' }],
    }
  }

  const operation = (await operationsBancaires(source)).find((x) => x.cle === cle)
  if (!operation) {
    return {
      statut: 'erreurs',
      erreurs: [{ champ: 'operation', code: 'operation-bancaire-introuvable' }],
    }
  }
  if (!operation.image) return ok(null)

  const reference = operation.image
  if (operation.partagee && operation.operation) {
    await source.operationsPartagees.definirImage(operation.operation.id, null)
  } else {
    await source.recus.definirImageVersement(
      operation.premierRecu.id,
      operation.premierVersement.id,
      null,
    )
  }
  await source.fichiers.supprimer(reference)

  await tracer(
    source,
    'Suppression image paiement',
    `Image retirée de ${instrumentEnFrancais(operation.nature).toLowerCase()} ${operation.numero}`,
    utilisateur,
  )

  return ok(null)
}

/**
 * R-90 — Dépose les deux images du passeport après l'enregistrement du reçu.
 *
 * Le fichier de référence conserve l'original et un portrait qui en est tiré.
 * Ici, les deux passent par le stockage de fichiers ; seules leurs références
 * sont conservées sur le reçu. Aucune lecture automatique n'intervient.
 */
export async function ajouterImagesPasseport(
  recuId: string,
  fichiers: {
    originale: { contenu: ArrayBuffer; nomOrigine: string; typeMime: string }
    portrait: { contenu: ArrayBuffer; nomOrigine: string; typeMime: string }
  } | null,
): Promise<Resultat<null>> {
  const source = sourceDonnees()
  if (!fichiers) return ok(null)

  const recu = await source.recus.parId(recuId)
  if (!recu) {
    return {
      statut: 'erreurs',
      erreurs: [{ champ: 'passeport', code: 'operation-bancaire-introuvable' }],
    }
  }

  let originale: ReferenceFichier
  let portrait: ReferenceFichier
  try {
    originale = await source.fichiers.deposer({ ...fichiers.originale, origine: 'upload' })
    portrait = await source.fichiers.deposer({ ...fichiers.portrait, origine: 'upload' })
  } catch (erreurDepot) {
    if (!(erreurDepot instanceof FormatImageNonAccepteError)) throw erreurDepot
    return { statut: 'erreurs', erreurs: [{ champ: 'passeport', code: 'format-image-non-accepte' }] }
  }

  try {
    await source.recus.definirImagesPasseport(recuId, originale, portrait)
  } catch (erreurDefinition) {
    // docs/architecture-generale.md, R3 — le passeport est un confort, jamais
    // un passage obligé : le noyau omra ne stocke pas ces images (CLAUDE.md
    // §8, reprise.md R-90). Le reçu vient déjà d'être enregistré avec succès ;
    // cet échec ne doit jamais remonter après coup. Journalisé pour le
    // diagnostic, jamais montré à l'employé.
    console.error('Dépôt des images de passeport ignoré :', erreurDefinition)
  }

  return ok(null)
}

/** R-90 — URL affichable du portrait d'un reçu, s'il en porte un. */
export async function urlPortraitPasseport(recuId: string): Promise<string> {
  const source = sourceDonnees()
  const recu = await source.recus.parId(recuId)
  const portrait = recu?.passeport?.imagePortrait
  return urlImage(source, portrait ?? null)
}

/**
 * Câblage ajouté le 2026-08-09 : détail des modifications d'un reçu — le
 * compteur (`Recu.nombreModifications`) existait déjà, jamais cette liste.
 * Appelé à la demande, seulement à l'ouverture de la fenêtre de détail —
 * jamais en bloc pour tous les reçus du registre.
 */
export async function historiqueRecu(recuId: string): Promise<Modification[]> {
  const source = sourceDonnees()
  return source.recus.historique(recuId)
}

/**
 * Journal des opérations (سجل العمليات) — description complète du
 * commanditaire (2026-08-09). Réservé à l'administrateur (poste 1) : la RPC
 * (`require_facturation_admin`) refuse tout autre poste, revérifié ici par la
 * même propagation d'erreur que le reste du service — aucun contrôle de rôle
 * dupliqué dans cette fonction.
 */
export async function journalOperations(
  filtres: FiltresJournalOperations,
): Promise<PageJournalOperations> {
  const source = sourceDonnees()
  return source.journalOperations.lister(filtres)
}
