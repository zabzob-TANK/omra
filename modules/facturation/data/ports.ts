/**
 * Ports — le seul point de couture entre ce module et son environnement.
 *
 * Deux familles :
 *
 *  1. **Ports de référentiel** (`ReferentielsPort`, `SessionPort`) — ces données
 *     existent déjà dans Omra. Le module les **lit** et ne les crée jamais.
 *     Aucune hypothèse n'est faite ici sur les noms de tables ou de colonnes
 *     du projet officiel : seule la forme lue est contractuelle.
 *
 *  2. **Ports de dépôt** (`RecusPort`, `OperationsPartageesPort`, …) — ces
 *     données sont propres à la facturation et créées par ce module.
 *
 * Le métier et l'interface ne dépendent que de ces interfaces. Brancher une
 * persistance réelle consiste à écrire une implémentation, sans toucher au reste.
 *
 * Toutes les méthodes sont asynchrones, y compris celles qu'un adaptateur en
 * mémoire pourrait rendre synchrones : la forme du contrat ne doit pas changer
 * lors du passage à Supabase.
 */

import type { CleJour } from '../domain/dates'
import type { DonneesCreationRecu } from '../domain/rules/create-receipt'
import type { CorrectionPremierVersement } from '../domain/rules/edit-sections'
import type {
  AcquittementAnomalie,
  Chambre,
  ChangementChamp,
  Client,
  EntreeAudit,
  Hotel,
  ImpressionFinance,
  ModeRemboursement,
  Modification,
  MouvementCaisse,
  OperationPartagee,
  Passeport,
  Rabatteur,
  Recu,
  ReferenceFichier,
  Saison,
  SectionModifiable,
  Tarif,
  Utilisateur,
  Versement,
  Vol,
} from '../domain/types'

// ---------------------------------------------------------------------------
// 1. Référentiels — existants dans Omra, en lecture seule
// ---------------------------------------------------------------------------

/**
 * Référentiels partagés avec le reste d'Omra.
 *
 * ⚠️ Ce module ne doit **jamais** écrire dans ces entités ni les recréer.
 * L'adaptateur de démonstration les sert depuis les constantes du prototype ;
 * l'adaptateur Omra les servira depuis les tables existantes du projet officiel.
 */

/**
 * Signale l'absence de toute saison active — un état d'exploitation normal
 * (avant la première saison, ou entre deux), pas une panne. `saisonActive()`
 * doit lever précisément cette erreur dans ce cas, jamais une `Error`
 * générique : `service.ts::chargerEtat()` la reconnaît pour afficher un
 * message propre au lieu de laisser planter toute l'interface, sans masquer
 * une véritable erreur de lecture (base injoignable, etc.).
 */
export class SaisonIndisponibleError extends Error {}

export interface ReferentielsPort {
  /** Saison courante. Fournit `reductionMaxCentimes`, utilisé par R-06. */
  saisonActive(): Promise<Saison>
  saisons(): Promise<Saison[]>
  hotels(): Promise<Hotel[]>
  vols(): Promise<Vol[]>
  chambres(): Promise<Chambre[]>
  rabatteurs(): Promise<Rabatteur[]>
  /**
   * Grille tarifaire d'une saison.
   *
   * R-05 — Une combinaison absente n'est pas un tarif nul : elle doit bloquer la
   * création du reçu. L'implémentation renvoie donc uniquement les combinaisons
   * réellement définies.
   */
  tarifs(saisonId: string): Promise<Tarif[]>
}

/**
 * Session et autorisations.
 *
 * Branché sur l'authentification Omra existante. Aucun mot de passe ni compte
 * n'est défini dans ce module (observation O-03).
 */
export interface SessionPort {
  /**
   * Vérifie un couple identifiant / mot de passe et renvoie l'utilisateur.
   *
   * Le fichier de référence conserve l'écran de connexion : il est reproduit.
   * Aucun compte n'est défini dans le domaine ni dans l'interface — seule
   * l'implémentation en connaît, et l'adaptateur Omra déléguera à
   * l'authentification existante.
   */
  connecter(identifiant: string, motDePasse: string): Promise<Utilisateur | null>
  /**
   * Ferme la session ouverte par `connecter()`.
   *
   * Séparation étanche Facturation/Administration : la Facturation ferme
   * désormais sa propre session elle-même (sans passer par la route /logout,
   * propre à l'Administration) — ce port doit donc réellement invalider la
   * session, pas seulement en tracer la fin.
   */
  deconnecter(): Promise<void>
  utilisateurCourant(): Promise<Utilisateur | null>
  /** R-39, R-61, R-65 — droits réservés à l'administrateur. */
  estAdministrateur(utilisateur: Utilisateur): boolean
  /**
   * R-43, R-44 — L'annulation exige une re-saisie du mot de passe.
   *
   * Le fichier de référence compare en clair le mot de passe de l'utilisateur
   * connecté. Ici, la vérification est déléguée : aucun secret ne transite par
   * le domaine, et l'implémentation Omra pourra s'appuyer sur une
   * ré-authentification côté serveur.
   */
  verifierIdentite(motDePasse: string): Promise<boolean>
}

// ---------------------------------------------------------------------------
// 2. Dépôts — propres à la facturation
// ---------------------------------------------------------------------------

export interface FiltreRecus {
  /** Recherche sur « prénom nom ». Prototype : `qn`. */
  nom?: string
  /** Recherche sur le numéro. Prototype : `qr`. */
  numero?: string
  /** Prototype : `showCx` — inclure les reçus annulés. */
  inclureAnnules?: boolean
  /**
   * reprise.md §5.3 — un écran ne mélange jamais les saisons. Omis, la liste
   * porte sur toutes les saisons ; fourni, elle se limite à celle-ci.
   */
  saisonId?: string
}

/**
 * Données nécessaires à la création d'un reçu (R-01 à R-14).
 *
 * Défini dans le domaine, où les règles le construisent. Réexporté ici pour que
 * les implémentations n'aient qu'un seul type à connaître.
 */
export type CreationRecu = DonneesCreationRecu

export interface RecusPort {
  lister(filtre?: FiltreRecus): Promise<Recu[]>
  parId(id: string): Promise<Recu | null>
  /**
   * reprise.md §5.3 — l'unicité réelle d'un reçu est saison + numéro, jamais
   * le numéro seul : deux saisons peuvent chacune porter un reçu n°1.
   * `saisonId` fourni, l'implémentation limite la recherche à cette saison et
   * refuse (renvoie `null`) plutôt que de deviner en cas d'ambiguïté.
   */
  parNumero(numero: number, saisonId?: string): Promise<Recu | null>
  /**
   * R-11 — Réserve et renvoie le prochain numéro de reçu.
   * L'implémentation doit garantir l'unicité même en accès concurrent.
   */
  reserverNumero(): Promise<number>
  creer(donnees: CreationRecu): Promise<Recu>
  /** R-22 — Ajoute un versement en fin de liste, sans toucher aux précédents. */
  ajouterVersement(recuId: string, versement: Versement): Promise<Recu>
  /** R-49 à R-55 — Applique une modification de section et empile sa trace. */
  appliquerModification(
    recuId: string,
    champsModifies: Partial<Recu>,
    modification: Modification,
  ): Promise<Recu>
  /**
   * P01, §5.9 — Corrige le premier versement (nature, instrument, passage
   * unique ↔ partagé, et montant pour un administrateur) et empile sa trace.
   * Le premier versement ne s'exprimant pas comme un `Partial<Recu>`, cette
   * méthode existe à part de `appliquerModification`.
   */
  corrigerPremierVersement(
    recuId: string,
    versement: CorrectionPremierVersement,
    nouvelleOperation: OperationPartagee | null,
    modification: Modification,
  ): Promise<Recu>
  /** R-45 à R-47 — Annule sans jamais supprimer. */
  annuler(
    recuId: string,
    donnees: {
      motif: string
      annulePar: string
      annuleLe: string
      modeRemboursement: ModeRemboursement
      montantRembourseCentimes: number
    },
  ): Promise<Recu>
  /** R-84 — Incrémente le compteur d'impressions et renvoie sa nouvelle valeur. */
  incrementerImpressions(recuId: string): Promise<number>
  /**
   * R-35, R-38, R-40 — Image d'un instrument **unique**, portée par le
   * versement lui-même. Les instruments partagés passent par
   * `OperationsPartageesPort.definirImage`, jamais par ici.
   */
  definirImageVersement(
    recuId: string,
    versementId: string,
    image: ReferenceFichier | null,
  ): Promise<void>
  /**
   * R-90 — Images du passeport rattachées au reçu : l'original et le portrait
   * qui en est tiré. Seules leurs références sont conservées.
   */
  definirImagesPasseport(
    recuId: string,
    originale: ReferenceFichier | null,
    portrait: ReferenceFichier | null,
  ): Promise<void>
}

export interface ClientsPort {
  lister(): Promise<Client[]>
  parId(id: string): Promise<Client | null>
  creer(client: Client): Promise<Client>
  rattacherRecu(clientId: string, recuId: string): Promise<void>
}

export interface OperationsPartageesPort {
  lister(): Promise<OperationPartagee[]>
  parId(id: string): Promise<OperationPartagee | null>
  creer(operation: OperationPartagee): Promise<OperationPartagee>
  /**
   * R-35, R-36, R-39, R-40 — Une seule image active.
   * Passer `null` supprime l'image ; l'autorisation est vérifiée en amont.
   */
  definirImage(operationId: string, image: ReferenceFichier | null): Promise<void>
}

export interface MouvementsCaissePort {
  /**
   * R-48 — Sorties réelles de caisse espèces.
   *
   * `saisonId` — reprise.md §5.3 : un écran ne mélange jamais les saisons.
   * Optionnel pour ne pas casser l'adaptateur de démonstration, mono-saison
   * par construction.
   */
  listerParJour(jour: CleJour, saisonId?: string): Promise<MouvementCaisse[]>
  lister(saisonId?: string): Promise<MouvementCaisse[]>
  creer(mouvement: MouvementCaisse): Promise<MouvementCaisse>
}

export interface ImpressionsFinancePort {
  /** `saisonId` — reprise.md §5.3, optionnel pour l'adaptateur de démonstration. */
  listerParJour(jour: CleJour, saisonId?: string): Promise<ImpressionFinance[]>
  /** R-62 — Enregistre la photographie des mouvements imprimés. */
  creer(impression: ImpressionFinance, saisonId?: string): Promise<ImpressionFinance>
}

export interface AcquittementsAnomaliePort {
  /** `saisonId` — reprise.md §5.3, optionnel pour l'adaptateur de démonstration. */
  parJour(jour: CleJour, saisonId?: string): Promise<AcquittementAnomalie | null>
  /** R-65 — Acquittement cumulatif, réservé à l'administrateur. */
  acquitter(acquittement: AcquittementAnomalie, saisonId?: string): Promise<void>
}

export interface JournalAuditPort {
  /** R-86 — Plus récente en tête. */
  lister(limite?: number): Promise<EntreeAudit[]>
  enregistrer(entree: EntreeAudit): Promise<void>
}

/**
 * Stockage de fichiers — images de chèques, passeports, portraits.
 *
 * Cible : Supabase Storage. Le domaine ne manipule que des `ReferenceFichier` ;
 * aucun contenu binaire ni `data:` URL ne circule dans le modèle.
 *
 * L'adaptateur de démonstration peut conserver les octets en mémoire, mais
 * l'interface reste celle d'un stockage de fichiers afin que le passage au
 * stockage réel ne modifie ni le métier ni l'interface.
 */

/**
 * Signale un fichier dont le type MIME n'est pas accepté pour un justificatif
 * (sécurité : seuls JPG/PNG/WebP sont acceptés, jamais SVG). `deposer()` doit
 * lever précisément cette erreur dans ce cas, jamais une `Error` générique :
 * `service.ts` la reconnaît pour renvoyer un `Resultat` d'erreur normal
 * (message propre affiché à l'utilisateur) plutôt que de laisser planter
 * toute la page.
 */
export class FormatImageNonAccepteError extends Error {}

export interface StockageFichiersPort {
  /** Dépose un fichier et renvoie sa référence. */
  deposer(fichier: {
    contenu: Blob | ArrayBuffer
    nomOrigine: string
    typeMime: string
    origine: string
  }): Promise<ReferenceFichier>
  /** Résout une référence en URL affichable, éventuellement signée et temporaire. */
  url(reference: ReferenceFichier): Promise<string>
  supprimer(reference: ReferenceFichier): Promise<void>
}

/**
 * Lecture automatique de passeport.
 *
 * R-90 — Le fichier de référence ne contient aucune lecture automatique : le
 * remplissage y est explicitement marqué `prototype-ai-simulation`.
 * L'implémentation par défaut est donc manuelle. Ce port existe pour qu'un
 * service réel puisse être branché plus tard sans toucher à l'interface.
 */
export interface LecteurPasseportPort {
  /** Renvoie `null` lorsque la lecture automatique n'est pas disponible. */
  lire(reference: ReferenceFichier): Promise<Partial<Passeport> | null>
  disponible(): boolean
}

/** Horloge injectable — rend les règles datées testables sans geler le temps global. */
export interface HorlogePort {
  maintenant(): Date
}

/** Générateur d'identifiants — isolé pour rendre les tests déterministes. */
export interface IdentifiantsPort {
  nouvelId(prefixe: string): string
}

// ---------------------------------------------------------------------------
// Agrégat
// ---------------------------------------------------------------------------

/**
 * Ensemble des dépendances externes du module.
 *
 * Une implémentation complète de cette interface suffit à faire fonctionner
 * l'application. C'est l'unique surface à réécrire lors du transfert vers Omra.
 */
export interface SourceDonnees {
  referentiels: ReferentielsPort
  session: SessionPort
  recus: RecusPort
  clients: ClientsPort
  operationsPartagees: OperationsPartageesPort
  mouvementsCaisse: MouvementsCaissePort
  impressionsFinance: ImpressionsFinancePort
  acquittementsAnomalie: AcquittementsAnomaliePort
  audit: JournalAuditPort
  fichiers: StockageFichiersPort
  lecteurPasseport: LecteurPasseportPort
  horloge: HorlogePort
  identifiants: IdentifiantsPort
}

/** Type utilitaire réexporté pour les implémentations. */
export type { ChangementChamp, SectionModifiable }
