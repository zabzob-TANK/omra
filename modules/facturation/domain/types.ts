/**
 * Modèle de domaine.
 *
 * Chaque champ porte en commentaire le nom de la propriété correspondante dans
 * le fichier de référence `Zemzem Asfar.dc.html`, afin que la correspondance
 * reste vérifiable ligne à ligne. La table complète se trouve dans
 * `docs/facturation/mapping-donnees.md`.
 *
 * Conventions :
 *  - tous les montants sont des **entiers en centimes** ;
 *  - les dates de saisie et d'affichage sont au format français `jj/mm/aaaa` ;
 *  - les clés de regroupement par journée sont au format `aaaa-mm-jj` ;
 *  - les champs arabes sont typés `string` mais toujours rendus via les
 *    primitives bidirectionnelles.
 */

import type { CleJour, DateFr } from './dates'
import type { NaturePaiement } from './payment-method'

// ---------------------------------------------------------------------------
// Référentiels — définis dans Omra, jamais créés par ce module
// ---------------------------------------------------------------------------

export interface Saison {
  id: string
  /** Prototype : `SAISON.nom`. */
  nom: string
  /** Prototype : `SAISON.reductionMax`, en centimes. Règle R-06. */
  reductionMaxCentimes: number
  /** Prototype : `SAISON.duree`. Libellé affiché tel quel. */
  duree: string
  active: boolean
}

export interface Hotel {
  id: string
  /** Valeur arabe. Prototype : `r.hotel`. */
  nom: string
}

export interface Vol {
  id: string
  /** Valeur arabe. Prototype : `r.vol`. */
  nom: string
}

export interface Chambre {
  id: string
  /** Prototype : `r.chambre` — '2' à '7'. Le code est aussi le libellé. */
  code: string
}

export interface Rabatteur {
  id: string
  /** Prototype : `r.rabatteur`. */
  nom: string
}

/**
 * Tarif d'une combinaison hôtel × vol × chambre pour une saison.
 * Prototype : `TARIFS['hôtel|vol'][chambre]`.
 *
 * Une combinaison absente n'est pas un tarif nul : elle bloque la création (R-05).
 */
export interface Tarif {
  saisonId: string
  hotelId: string
  volId: string
  chambreId: string
  /** En centimes. */
  montantCentimes: number
}

export interface Utilisateur {
  id: string
  /** Prototype : `USERS[id].nom` — valeur arabe. */
  nom: string
  /** Prototype : `USERS[id].role`. */
  role: string
  /** Prototype : `USERS[id].ini` — initiales affichées dans l'en-tête. */
  initiales: string
}

// ---------------------------------------------------------------------------
// Entités propres à la facturation — créées par ce module
// ---------------------------------------------------------------------------

/** Prototype : `db.clients[]`. */
export interface Client {
  id: string
  /** Valeur arabe. Prototype : `c.nom`. */
  nom: string
  /** Valeur arabe. Prototype : `c.prenom`. */
  prenom: string
  /** Prototype : `c.photoUrl` — portrait extrait du passeport. */
  photoUrl: string
  passeport: Passeport | null
  /** Horodatage `jj/mm/aaaa HH:MM`. Prototype : `c.createdAt`. */
  creeLe: string
  /** Prototype : `c.createdBy`. */
  creePar: string
  /** Prototype : `c.receiptIds`. */
  recuIds: string[]
}

/**
 * Données de passeport.
 *
 * R-90 — La lecture automatique n'existe pas dans le fichier de référence : le
 * remplissage y est explicitement marqué `prototype-ai-simulation`. Le module
 * conserve la saisie et la correction manuelles, derrière `LecteurPasseportPort`.
 */
export interface Passeport {
  /** Prototype : `passportDraft.pre` — valeur arabe. */
  prenom: string
  /** Prototype : `passportDraft.nom` — valeur arabe. */
  nom: string
  /** Prototype : `passportDraft.number`. Lu de gauche à droite. */
  numero: string
  nationalite: string
  /** `jj/mm/aaaa`. */
  dateNaissance: string
  lieuNaissance: string
  /** `jj/mm/aaaa`. */
  dateEmission: string
  /** `jj/mm/aaaa`. */
  dateExpiration: string
  paysEmission: string
  sexe: string
  /** Zone de lecture optique, brute. Lue de gauche à droite. */
  mrz: string
  /** Référence de l'image d'origine dans le stockage de fichiers. */
  imageOriginale: ReferenceFichier | null
  /** Référence du portrait recadré. */
  imagePortrait: ReferenceFichier | null
  /** Prototype : `passportDraft.scanId`. */
  scanId: string
  /** Prototype : `rawResult` — trace de l'origine de la saisie. */
  resultatBrut: ResultatLecturePasseport | null
}

export interface ResultatLecturePasseport {
  /** Prototype : `'prototype-upload'` ou `'prototype-ai-simulation'`. */
  source: string
  recuLe: string
  [cle: string]: unknown
}

/**
 * Référence vers un fichier stocké.
 *
 * Cible : Supabase Storage. Le domaine ne manipule jamais de contenu binaire ni
 * de `data:` URL — uniquement cette référence, résolue par `StockageFichiersPort`.
 */
export interface ReferenceFichier {
  /** Chemin dans le bucket. */
  chemin: string
  /** Nom d'origine, affiché à l'utilisateur. */
  nomOrigine: string
  /** Prototype : `source` — `'upload'` ou `'demo'`. */
  origine: string
  /** Horodatage de dépôt. */
  deposeLe: string
  /**
   * Auteur du dépôt. Le fichier de référence l'affiche dans la fenêtre de
   * détail d'un paiement : « Image ajoutée le … par … ».
   */
  deposePar?: string
}

/** Statut d'un reçu. Prototype : `r.statut` puis `stat()`. */
export type StatutRecu = 'نشط' | 'ملغى'

/** Statut calculé, affiché. Prototype : `stat()` — règle U-06, lot L1. */
export type StatutAffiche = 'مسدد' | 'غير مكتمل' | 'ملغى'

/** Prototype : `db.recus[]`. */
export interface Recu {
  id: string
  /** Prototype : `r.numero`. Séquence issue de `db.prochainNumero` (R-11). */
  numero: number
  clientId: string
  passeport: Passeport | null
  /** Valeur arabe. Prototype : `r.prenom`. */
  prenom: string
  /** Valeur arabe. Prototype : `r.nom`. */
  nom: string
  /** Prototype : `r.tel` — format `0XXX-XX.XX.XX`. */
  telephone: string

  /** Valeur arabe. Prototype : `r.hotel`. */
  hotel: string
  /** Valeur arabe. Prototype : `r.vol`. */
  vol: string
  /** Prototype : `r.chambre`. */
  chambre: string
  /** Prototype : `r.tarif`, en centimes. */
  tarifCentimes: number
  /** Prototype : `r.reduction`, en centimes. */
  reductionCentimes: number
  /** Prototype : `r.convenu` = tarif − réduction (R-08), en centimes. */
  convenuCentimes: number
  /** Valeur arabe. Prototype : `r.rabatteur`. Non modifiable (R-54). */
  rabatteur: string
  /** Prototype : `r.groupe` — code de famille, vide si absent. */
  groupe: string
  /** Prototype : `r.note`. */
  note: string

  /** Prototype : `r.date`. */
  date: DateFr
  /** Prototype : `r.heure` — horodatage complet malgré son nom. */
  creeLe: string
  /** Prototype : `r.employe`. */
  employe: string

  statut: StatutRecu
  /** Prototype : `r.motif` — motif d'annulation, vide si actif. */
  motifAnnulation: string
  /** Prototype : `r.annulePar`. */
  annulePar?: string
  /** Prototype : `r.annuleLe` — horodatage. */
  annuleLe?: string
  /** Prototype : `r.refundMode`. R-47. */
  modeRemboursement?: ModeRemboursement
  /** Prototype : `r.refundAmount`, en centimes. R-46. */
  montantRembourseCentimes?: number

  /**
   * Prototype : `r.impressions`. R-84.
   *
   * `null` signifie une lecture ratée, pas « jamais imprimé » : les deux ne
   * doivent jamais se confondre à l'écran (voir `data/supabase/read.ts`,
   * `chargerResumeImpressionRecu`).
   */
  impressions: number | null
  /**
   * Prototype : `r.modifications[]`, plus récente en tête.
   *
   * Toujours vide pour l'instant — voir `mapReceiptDetailToRecu` dans
   * `data/supabase/mappers.ts` : traduire le détail par champ (avant/après
   * nommés) exige de décider quels champs diffuser et sous quels libellés,
   * une décision pas encore prise. `nombreModifications` ci-dessous porte le
   * vrai compte, indépendamment de cette liste encore vide.
   */
  modifications: Modification[]
  /** Nombre réel de modifications enregistrées — voir la note sur `modifications`. */
  nombreModifications: number
  /** Prototype : `r.derniereModification`. */
  derniereModification?: string
  /** Prototype : `r.modifiePar`. */
  modifiePar?: string

  /** Prototype : `r.vers[]`. */
  versements: Versement[]

  /**
   * Décision du commanditaire (2026-08-08, reprise.md §5.11) : un restant
   * ≤ 0 vaut désormais « soldé » partout (`statutAffiche`, `symboleSituation`)
   * — le trop-perçu n'a donc plus le statut du reçu pour rester visible. Ce
   * tableau, traduit de `get_billing_receipt_details.active_anomalies` (déjà
   * calculé côté serveur, jamais recalculé ici), porte cette visibilité de
   * façon indépendante. Vide tant qu'aucune anomalie n'est active.
   */
  anomalies: AnomalieFinanciere[]
}

/**
 * Traduction domaine de `active_anomalies` (`get_billing_receipt_details`) :
 *  - `trop-percu` — restant < 0, uniquement possible après une modification
 *    commerciale qui réduit le convenu sous ce qui est déjà payé (R-21
 *    empêche tout surpaiement direct à la saisie d'un versement) ;
 *  - `reste-a-payer` — restant > 0 signalé comme anomalie par la dernière
 *    modification commerciale (P13) ; distinct du simple statut « incomplet »
 *    routinier, qui n'est jamais dans cette liste ;
 *  - `justificatif-cheque-manquant` — une opération chèque de ce reçu sans
 *    image active, `operationId` renseigné.
 *
 * Jamais fusionnées : trois natures d'anomalie différentes, jamais confondues
 * à l'écran ni dans le domaine.
 */
export type TypeAnomalie = 'trop-percu' | 'reste-a-payer' | 'justificatif-cheque-manquant'

export interface AnomalieFinanciere {
  type: TypeAnomalie
  /** `null` pour `justificatif-cheque-manquant`, qui ne porte pas de montant. */
  montantCentimes: number | null
  /** Opération concernée — uniquement `justificatif-cheque-manquant`. */
  operationId?: string
  dernierChangement: string
}

/** R-47 — `cash` sort de la caisse espèces, `none` est géré hors caisse. */
export type ModeRemboursement = 'cash' | 'none'

/** Portée d'un versement. Prototype : `v.paymentScope`. */
export type PorteeVersement = 'unique' | 'shared'

/** Prototype : `r.vers[i]`. */
export interface Versement {
  id: string
  /** Prototype : `v.n` — rang à partir de 1. */
  rang: number
  /** Prototype : `v.montant`, en centimes. */
  montantCentimes: number
  /** Prototype : `v.mode`. */
  nature: NaturePaiement | string
  /** Prototype : `v.date`. */
  date: DateFr
  /** Prototype : `v.heure` — `HH:MM`. */
  heure: string
  /** Prototype : `v.dateHeure` — horodatage complet. */
  dateHeure: string
  /** Prototype : `v.par` — employé ayant enregistré. */
  enregistrePar: string

  /** Prototype : `v.cn` — numéro de chèque ou référence de virement. */
  referenceInstrument: string
  /** Prototype : `v.cd` — date de l'instrument, `jj/mm/aaaa`. */
  dateInstrument: string
  /** Prototype : `v.cb` — banque. */
  banque: string

  portee: PorteeVersement
  /** Prototype : `v.sharedOperationId`. Vide si versement unique. */
  operationPartageeId: string
  /** Prototype : `v.qui` — personne ayant effectué le paiement partagé. */
  payeur: string
  /** Prototype : `v.colAmt` — montant total de l'opération partagée, en centimes. */
  montantOperationCentimes: number

  /**
   * Prototype : `v.checkImage`.
   * R-38 — Pour un versement partagé, l'image appartient à l'opération et ce
   * champ reste `null`. Il n'est renseigné que pour un instrument unique.
   */
  image: ReferenceFichier | null

  /** R-14, R-22 — instantané figé, jamais réécrit. */
  instantane: InstantaneVersement
}

/**
 * Décision de performance (2026-08-09) : un versement de toute la saison,
 * avec les seules infos de son reçu porteur nécessaires à Paiements, au
 * Journal financier et au Suivi journalier — jamais un `Recu` complet.
 *
 * `versement.instantane` EST inclus (contrairement à une première version de
 * cette décision) : le Journal financier construit chaque ligne affichée
 * depuis l'instantané figé (client, programme, convenu, restant après CE
 * versement, statut après) — l'omettre aurait cassé `journalFinancier` dans
 * `service.ts`. `list_billing_season_payments` le porte via les colonnes
 * `payment_snapshot_*` de `receipt_payments`, jamais recalculé.
 *
 * `operationEnregistreeLe` porte la date d'enregistrement de l'opération
 * (chèque/virement partagé) — distincte de `versement.dateHeure`, qui reste
 * la date de CE versement précis. Un chèque partagé peut avoir été enregistré
 * un autre jour que certaines de ses attributions ; Paiements groupe par la
 * première, le Journal financier et le Suivi journalier par la seconde —
 * chacun garde sa règle actuelle, aucune des deux n'est perdue.
 */
export interface VersementSaison {
  versement: Versement
  operationEnregistreeLe: string
  recu: {
    id: string
    numero: number
    prenom: string
    nom: string
    statut: StatutRecu
    employe: string
    /**
     * État ACTUEL de l'inscription (pas figé) — sert uniquement de filet
     * pour `journalFinancier` quand `versement.instantane` n'a pas de
     * valeur pour ce champ (lignes trop anciennes pour un instantané
     * complet). Ne jamais utiliser à la place de l'instantané par défaut.
     */
    hotel: string
    chambre: string
    vol: string
    rabatteur: string
    convenuCentimes: number
  }
}

/**
 * Décision de performance (2026-08-09) : un reçu de la saison, réduit aux
 * champs que le Suivi journalier et le Journal financier lisent pour compter
 * les nouvelles inscriptions et les annulations par jour — jamais un `Recu`
 * complet avec ses versements. `totalPayeCentimes` remplace `totalPaye(recu)`
 * (déjà agrégé côté RPC, jamais resommé ici).
 */
export interface RecuSaison {
  id: string
  numero: number
  /** Date d'inscription, `jj/mm/aaaa`. */
  date: DateFr
  statut: StatutRecu
  /** Horodatage d'annulation, absent si le reçu est actif. */
  annuleLe?: string
  totalPayeCentimes: number
}

/**
 * Décision de performance (2026-08-09) : un événement de modification de la
 * saison, à plat — remplace le parcours de `recu.modifications` sur tous les
 * reçus pour compter les modifications par jour. Corrige au passage un bug
 * préexistant et distinct : `recu.modifications` vaut toujours `[]` côté
 * adaptateur réel (voir `mapReceiptDetailToRecu`), donc ce compte était déjà
 * toujours à zéro en production, quel que soit le nombre réel de
 * modifications — vérifié en direct sur la vraie saison le 2026-08-09
 * (11 événements réels contre 0 affichés).
 */
export interface EvenementModificationSaison {
  id: string
  recuNumero: number
  /** Valeur arabe. */
  prenom: string
  /** Valeur arabe. */
  nom: string
  /** Prototype absent — libellé de section, comme `Modification.sectionLibelle`. */
  sectionLibelle: string
  /**
   * Détail champ par champ (2026-08-09) : reconstruit depuis
   * `before_data`/`after_data` via `changementsHistorique` — alimente le
   * tableau du Journal financier (R-60) et, un jour, un affichage
   * équivalent ici même. Vide pour un type d'action sans correspondance
   * (dossier/groupe — voir reprise.md).
   */
  changements: ChangementChamp[]
  motif: string
  employe: string
  survenuLe: string
}

/**
 * Une ligne du journal des opérations (سجل العمليات) — fenêtre déjà présente
 * dans l'écran (R-86), réservée à l'administrateur de facturation (poste 1).
 * Une ligne par action enregistrée dans `facturation_action_history`, quel
 * que soit son type : création de reçu, versement, annulation, modification,
 * impression, confirmation de dépassement, acquittement d'anomalie —
 * description complète du commanditaire (2026-08-09), qui remplace toute
 * description antérieure de cet écran.
 */
export interface LigneJournalOperations {
  id: string
  heure: string
  date: string
  /**
   * Libellé arabe de la nature de l'action — un type d'action générique, ou
   * pour une modification, la section touchée (même libellé que
   * `Modification.sectionLibelle`, jamais réinventé).
   */
  nature: string
  /**
   * `facturation_action_history.action_type` brut — sert uniquement au
   * filtre par type ; jamais affiché tel quel (voir `nature`).
   */
  typeAction: string
  /** Présents seulement quand l'action porte sur un reçu. */
  numeroRecu?: number
  /** Valeur arabe. */
  client?: string
  /** Détail champ par champ, seulement pour une modification. */
  changements: ChangementChamp[]
  motif?: string
  employe: string
  /** `account_slots.slot_number` de l'auteur — pour le filtre par employé, jamais affiché tel quel. */
  employeSlot: number
}

/** Bornes lundi–dimanche (incluses) d'une semaine affichée dans le journal des opérations. */
export interface SemaineJournal {
  debut: CleJour
  fin: CleJour
}

/** Page de résultats du journal des opérations, avec le total pour la pagination. */
export interface PageJournalOperations {
  lignes: LigneJournalOperations[]
  totalLignes: number
}

/**
 * Instantané figé au moment du versement.
 *
 * C'est le mécanisme central du système : une modification ultérieure du reçu
 * ne réécrit jamais l'historique financier. Prototype : `v.snapshot`.
 */
export interface InstantaneVersement {
  /** Prototype : `snapshot.client` — « prénom nom », valeur arabe. */
  client: string
  /** Prototype : `snapshot.hotel`. */
  hotel: string
  /** Prototype : `snapshot.room`. */
  chambre: string
  /** Prototype : `snapshot.flight`. */
  vol: string
  /** Prototype : `snapshot.program` — « hôtel / غرفة N / vol ». */
  programme: string
  /** Prototype : `snapshot.agreed`, en centimes. */
  convenuCentimes: number
  /** Prototype : `snapshot.rabatteur`. */
  rabatteur: string
  /** Prototype : `snapshot.remainingAfter`, en centimes. */
  restantApresCentimes: number
  /** Prototype : `snapshot.statusAfter` — '✓' ou '•'. */
  statutApres: '✓' | '•'
}

/**
 * Opération de paiement partagée : un chèque ou un virement unique réglant
 * plusieurs reçus. Prototype : `db.sharedPaymentOperations[]`.
 *
 * R-34 — L'opération reste **une seule opération financière**. Les totaux ne
 * additionnent jamais les parts et le montant de l'opération.
 */
export interface OperationPartagee {
  /** Prototype : `op.id` — `SOP-…` ou identité dérivée `shared|banque|numéro|date`. */
  id: string
  /** Prototype : `op.mode`. */
  nature: NaturePaiement | string
  /** Prototype : `op.reference`. */
  reference: string
  /** Prototype : `op.instrumentDate`, `jj/mm/aaaa`. */
  dateInstrument: string
  /** Prototype : `op.bank`. */
  banque: string
  /** Prototype : `op.payer` — personne ayant payé. */
  payeur: string
  /** Prototype : `op.totalAmount`, en centimes. */
  montantTotalCentimes: number
  /** Prototype : `op.createdAt`. */
  creeeLe: string
  /** Prototype : `op.createdBy`. */
  creeePar: string
  /** Prototype : `op.status` — `'active'` ou `'archived'` (R-31). */
  statut: 'active' | 'archived'
  /**
   * Prototype : `op.checkImage`.
   * R-35, R-38 — une seule image active, portée par l'opération.
   */
  image: ReferenceFichier | null
}

/** Section modifiable d'un reçu. R-49 — une seule à la fois. */
export type SectionModifiable =
  | 'identity'
  | 'contact'
  | 'program'
  | 'group'
  | 'note'
  | 'firstPayment'

/** Prototype : `r.modifications[i]`. */
export interface Modification {
  id: string
  /** Prototype : `mod.rubrique`. */
  section: SectionModifiable
  /** Prototype : `mod.rubriqueLabel`. */
  sectionLibelle: string
  /** Prototype : `mod.changements[]`. */
  changements: ChangementChamp[]
  /** Prototype : `mod.motif`. Obligatoire (R-50). */
  motif: string
  /** Prototype : `mod.employe`. */
  employe: string
  /** Prototype : `mod.dateHeure`. */
  dateHeure: string
}

/** Prototype : `{champ, ancienne, nouvelle}`. */
export interface ChangementChamp {
  champ: string
  ancienne: string
  nouvelle: string
}

/**
 * Mouvement de caisse espèces. Prototype : `db.cashMovements[]`.
 *
 * R-48 — Seuls les remboursements réellement sortis en espèces y figurent,
 * quel que soit le mode de paiement d'origine.
 */
export interface MouvementCaisse {
  id: string
  /** Prototype : `m.type` — seul `refund_cash` existe dans le fichier. */
  type: 'refund_cash'
  jour: CleJour
  date: DateFr
  /** `HH:MM`. */
  heure: string
  /** En centimes. */
  montantCentimes: number
  /** Numéro du reçu concerné. */
  recuNumero: number
  /** Valeur arabe. */
  client: string
  employe: string
}

/**
 * Trace d'une impression du journal financier. Prototype : `db.financePrints[]`.
 * R-62, R-63 — `mouvementIds` est la photographie de ce qui figurait sur le papier.
 */
export interface ImpressionFinance {
  id: string
  jour: CleJour
  /** Horodatage. Prototype : `p.printedAt`. */
  imprimeLe: string
  /** Prototype : `p.employee`. */
  employe: string
  /** Prototype : `p.printNo` — numéro d'impression du jour, à partir de 1. */
  numeroImpression: number
  /** Prototype : `p.movementIds`, triés. */
  mouvementIds: string[]
  /** Prototype : `p.rowCount`. */
  nombreLignes: number
}

/**
 * Acquittement d'anomalie par un administrateur.
 * Prototype : `db.financeAnomalyAcks[jour]`. R-65.
 */
export interface AcquittementAnomalie {
  jour: CleJour
  mouvementIds: string[]
  /** Horodatage. */
  acquitteLe: string
  /** Identité de l'administrateur. */
  acquittePar: string
}

/** Entrée du journal d'audit. Prototype : `db.audit[]`, plus récente en tête. */
export interface EntreeAudit {
  id: string
  /** Prototype : `a.t` — horodatage. */
  horodatage: string
  /** Prototype : `a.a` — action. */
  action: string
  /** Prototype : `a.d` — détail. */
  detail: string
  /** Prototype : `a.u` — utilisateur. */
  utilisateur: string
}
