/**
 * Jeu de données de démonstration.
 *
 * ⚠️ ISOLATION — Ce fichier est le **seul** endroit du module contenant des
 * données fictives. Il n'est importé que par l'adaptateur de démonstration.
 * Aucun fichier de `domain/` ni d'`ui/` ne doit y faire référence.
 *
 * Le jeu couvre **six journées consécutives**, de J-5 à aujourd'hui, et cherche
 * à faire apparaître à l'écran chaque règle qui se voit :
 *
 *  Paiements          un reçu soldé dès le premier versement ; un dossier mené
 *                     jusqu'à six versements dont le sixième solde exactement
 *                     (R-18, R-20) ; espèces, chèque et virement mêlés.
 *  Opérations         un chèque partagé entre trois reçus d'une même famille ;
 *  partagées          un virement réutilisé un autre jour pour une nouvelle
 *                     attribution (R-31) ; une attribution en dépassement
 *                     confirmé, qui laisse un restant négatif (R-32).
 *  Justificatifs      des opérations avec image et une sans, pour alimenter le
 *                     compteur « شيكات بدون صورة ».
 *  Annulations        une avec sortie de caisse espèces, une sans (R-46, R-47).
 *  Modifications      identité puis programme et prix, avec leur historique
 *                     complet et le motif de chacune (R-49 à R-55).
 *  Journal financier  des impressions sur quatre journées, dont une journée
 *                     imprimée deux fois, et un versement enregistré après
 *                     l'impression : il ressort en anomalie (R-62, R-63).
 *  Suivi journalier   une journée entièrement vide, pour que le filtre des
 *                     journées sans mouvement ait quelque chose à masquer.
 *  Cas particuliers   deux voyageuses homonymes, qui doivent rester deux
 *                     dossiers distincts ; un reçu portant un passeport ; des
 *                     libellés de rabatteur en arabe comme en caractères
 *                     latins ; trois employés différents.
 *
 * Toutes les combinaisons hôtel × vol × chambre employées existent dans la
 * grille tarifaire de `constants.ts` : une combinaison absente bloquerait la
 * modification du programme (R-05).
 */

import { construireJourneeVolumineuse } from './dataset-volume'
import type {
  Client,
  EntreeAudit,
  ImpressionFinance,
  Modification,
  MouvementCaisse,
  OperationPartagee,
  Passeport,
  Recu,
  Versement,
} from '../../domain/types'

/**
 * Image de démonstration à déposer par l'adaptateur.
 *
 * Le jeu de données ne connaît pas le stockage de fichiers : il décrit ce qu'il
 * faut déposer, et l'adaptateur s'en charge puis rattache la référence obtenue.
 */
export interface ImageAmorcee {
  /** `operation:<id>` ou `versement:<recuId>:<versementId>`. */
  cible: string
  reference: string
  banque: string
  montantCentimes: number
  payeur: string
  date: string
  virement: boolean
}

export interface JeuDemonstration {
  prochainNumero: number
  recus: Recu[]
  clients: Client[]
  operationsPartagees: OperationPartagee[]
  mouvementsCaisse: MouvementCaisse[]
  impressionsFinance: ImpressionFinance[]
  audit: EntreeAudit[]
  /** R-35 — images amorcées, une par opération au plus. */
  imagesAmorcees: ImageAmorcee[]
}

/** Décale une date de `delta` jours et renvoie ses deux représentations. */
function jour(delta: number, reference: Date) {
  const d = new Date(reference)
  d.setDate(d.getDate() + delta)
  const annee = d.getFullYear()
  const mois = String(d.getMonth() + 1).padStart(2, '0')
  const jourDuMois = String(d.getDate()).padStart(2, '0')
  return {
    cle: `${annee}-${mois}-${jourDuMois}`,
    fr: `${jourDuMois}/${mois}/${annee}`,
  }
}

interface OptionsVersement {
  rang: number
  montantCentimes: number
  nature: string
  date: string
  heure: string
  enregistrePar: string
  referenceInstrument?: string
  dateInstrument?: string
  banque?: string
  portee?: 'unique' | 'shared'
  operationPartageeId?: string
  payeur?: string
  montantOperationCentimes?: number
  instantane: Versement['instantane']
}

function versement(id: string, o: OptionsVersement): Versement {
  return {
    id,
    rang: o.rang,
    montantCentimes: o.montantCentimes,
    nature: o.nature,
    date: o.date,
    heure: o.heure,
    dateHeure: `${o.date} ${o.heure}`,
    enregistrePar: o.enregistrePar,
    referenceInstrument: o.referenceInstrument ?? '',
    dateInstrument: o.dateInstrument ?? '',
    banque: o.banque ?? '',
    portee: o.portee ?? 'unique',
    operationPartageeId: o.operationPartageeId ?? '',
    payeur: o.payeur ?? '',
    montantOperationCentimes: o.montantOperationCentimes ?? 0,
    image: null,
    instantane: o.instantane,
  }
}

/**
 * Scénarios de démonstration.
 *
 *  - `standard` — les six journées décrites en tête de fichier. Mode normal.
 *  - `pagination` — le même jeu, augmenté d'une journée chargée servant
 *    uniquement à vérifier l'impression sur plusieurs pages. Il ne s'active
 *    jamais tout seul.
 */
export type ScenarioDemonstration = 'standard' | 'pagination'

/** Description d'un versement, avant calcul de son instantané. */
interface Paiement {
  montantCentimes: number
  nature: string
  /** Journée du versement, `jj/mm/aaaa`. */
  date: string
  heure: string
  employe?: string
  referenceInstrument?: string
  dateInstrument?: string
  banque?: string
  portee?: 'unique' | 'shared'
  operationPartageeId?: string
  payeur?: string
  montantOperationCentimes?: number
}

/** Description d'un reçu, avant construction. */
interface Dossier {
  numero: number
  prenom: string
  nom: string
  telephone: string
  hotel: string
  vol: string
  chambre: string
  /** Tarif de la grille, en centimes. */
  tarifCentimes: number
  reductionCentimes?: number
  rabatteur: string
  groupe?: string
  note?: string
  /** Journée de création, `jj/mm/aaaa`. */
  date: string
  heure: string
  employe: string
  impressions?: number
  passeport?: Passeport | null
  modifications?: Modification[]
  derniereModification?: string
  modifiePar?: string
  annulation?: {
    motif: string
    par: string
    /** Journée de l'annulation, `jj/mm/aaaa`. */
    date: string
    heure: string
    /** Journée de l'annulation, `aaaa-mm-jj`. */
    cle: string
    mode: 'cash' | 'none'
  }
  paiements: Paiement[]
}

export function construireJeuDemonstration(
  reference: Date = new Date(),
  scenario: ScenarioDemonstration = 'standard',
): JeuDemonstration {
  const j5 = jour(-5, reference)
  const j4 = jour(-4, reference)
  const j3 = jour(-3, reference) // journée volontairement vide
  const j2 = jour(-2, reference)
  const j1 = jour(-1, reference)
  const j0 = jour(0, reference)
  void j3

  const EMPLOYE = 'سمير بنعلي'
  const CAISSIERE = 'نجاة الإدريسي'
  const DIRECTEUR = 'المدير'

  const recus: Recu[] = []
  const clients: Client[] = []
  const mouvementsCaisse: MouvementCaisse[] = []

  /**
   * Construit un reçu complet à partir de sa description.
   *
   * Les instantanés sont **calculés** et non recopiés : le restant après chaque
   * versement, le symbole de situation et le libellé de programme découlent des
   * montants. Écrits à la main, ils finissaient toujours par mentir.
   */
  function ajouterRecu(d: Dossier): Recu {
    const reductionCentimes = d.reductionCentimes ?? 0
    const convenuCentimes = d.tarifCentimes - reductionCentimes
    const clientId = `CLI-DEMO-${String(d.numero).padStart(6, '0')}`
    const client = `${d.prenom} ${d.nom}`
    const programme = `${d.hotel} / غرفة ${d.chambre} / ${d.vol}`

    let cumul = 0
    const versements = d.paiements.map((p, index) => {
      cumul += p.montantCentimes
      const restantApres = Math.max(0, convenuCentimes - cumul)
      return versement(`p-demo-${d.numero}-${index + 1}`, {
        rang: index + 1,
        montantCentimes: p.montantCentimes,
        nature: p.nature,
        date: p.date,
        heure: p.heure,
        enregistrePar: p.employe ?? d.employe,
        referenceInstrument: p.referenceInstrument,
        dateInstrument: p.dateInstrument,
        banque: p.banque,
        portee: p.portee,
        operationPartageeId: p.operationPartageeId,
        payeur: p.payeur,
        montantOperationCentimes: p.montantOperationCentimes,
        instantane: {
          client,
          hotel: d.hotel,
          chambre: d.chambre,
          vol: d.vol,
          programme,
          convenuCentimes,
          rabatteur: d.rabatteur,
          restantApresCentimes: restantApres,
          statutApres: restantApres <= 0 ? '✓' : '•',
        },
      })
    })

    const recu: Recu = {
      id: `r-demo-${d.numero}`,
      numero: d.numero,
      clientId,
      passeport: d.passeport ?? null,
      prenom: d.prenom,
      nom: d.nom,
      telephone: d.telephone,
      hotel: d.hotel,
      vol: d.vol,
      chambre: d.chambre,
      tarifCentimes: d.tarifCentimes,
      reductionCentimes,
      convenuCentimes,
      rabatteur: d.rabatteur,
      groupe: d.groupe ?? '',
      note: d.note ?? '',
      date: d.date,
      creeLe: `${d.date} ${d.heure}`,
      employe: d.employe,
      statut: d.annulation ? 'ملغى' : 'نشط',
      motifAnnulation: d.annulation?.motif ?? '',
      annulePar: d.annulation?.par,
      annuleLe: d.annulation ? `${d.annulation.date} ${d.annulation.heure}` : undefined,
      modeRemboursement: d.annulation?.mode,
      // R-46 — le montant annulé est toujours la totalité de ce qui a été payé.
      montantRembourseCentimes: d.annulation ? cumul : undefined,
      impressions: d.impressions ?? 0,
      modifications: d.modifications ?? [],
      derniereModification: d.derniereModification,
      modifiePar: d.modifiePar,
      // Cohérent avec l'adaptateur Supabase (`traduireAnomalies`) : un
      // trop-perçu réel (jamais un simple reçu soldé pile) reste visible
      // indépendamment du statut, même en démonstration.
      anomalies:
        cumul > convenuCentimes
          ? [
              {
                type: 'trop-percu' as const,
                montantCentimes: cumul - convenuCentimes,
                dernierChangement: `${d.date} ${d.heure}`,
              },
            ]
          : [],
      versements,
    }

    recus.push(recu)
    clients.push({
      id: clientId,
      nom: d.nom,
      prenom: d.prenom,
      photoUrl: '',
      passeport: d.passeport ?? null,
      creeLe: recu.creeLe,
      creePar: d.employe,
      recuIds: [recu.id],
    })

    // R-47 — seule une annulation remboursée en espèces sort de la caisse.
    if (d.annulation?.mode === 'cash') {
      mouvementsCaisse.push({
        id: `refund-demo-${d.numero}`,
        type: 'refund_cash',
        jour: d.annulation.cle,
        date: d.annulation.date,
        heure: d.annulation.heure,
        montantCentimes: cumul,
        recuNumero: d.numero,
        client,
        employe: d.annulation.par,
      })
    }

    return recu
  }

  // ============================================== Opérations partagées =====

  /** Un chèque règle trois reçus d'une même famille. Entièrement réparti. */
  const chequeFamille: OperationPartagee = {
    id: 'SOP-DEMO-0002',
    nature: 'شيك',
    reference: '7742015',
    dateInstrument: j4.fr,
    banque: 'البنك الشعبي',
    payeur: 'عبد الرحمان بنعني',
    montantTotalCentimes: 9000000,
    creeeLe: `${j4.fr} 09:20`,
    creeePar: EMPLOYE,
    statut: 'active',
    image: null,
  }

  /** Virement réutilisé : une attribution à J-2, une seconde à J-1 (R-31). */
  const virementReutilise: OperationPartagee = {
    id: 'SOP-DEMO-0003',
    nature: 'تحويل بنكي',
    reference: 'VIR-2026-0455',
    dateInstrument: j2.fr,
    banque: 'التجاري وفا بنك',
    payeur: 'عبد الله العثماني',
    montantTotalCentimes: 6000000,
    creeeLe: `${j2.fr} 11:05`,
    creeePar: EMPLOYE,
    statut: 'active',
    image: null,
  }

  /** Chèque dont l'attribution dépasse le total, après confirmation (R-32). */
  const chequeDepasse: OperationPartagee = {
    id: 'SOP-DEMO-0004',
    nature: 'شيك',
    reference: '8890734',
    dateInstrument: j1.fr,
    banque: 'بنك المغرب',
    payeur: 'إدريس الفاسي',
    montantTotalCentimes: 1000000,
    creeeLe: `${j1.fr} 15:40`,
    creeePar: DIRECTEUR,
    statut: 'active',
    image: null,
  }

  // ===================================================== J-5 — ouverture ===

  // Soldé dès le premier versement, avec la réduction maximale de la saison.
  ajouterRecu({
    numero: 250,
    prenom: 'ياسين',
    nom: 'العامري',
    telephone: '0611-24.80.15',
    hotel: 'منار الشروق',
    vol: 'الخطوط السعودية',
    chambre: '2',
    tarifCentimes: 3480000,
    reductionCentimes: 300000, // R-06 — exactement le plafond de la saison
    rabatteur: 'zemzem',
    note: 'دفع كامل عند التسجيل',
    date: j5.fr,
    heure: '08:45',
    employe: EMPLOYE,
    impressions: 1,
    paiements: [{ montantCentimes: 3180000, nature: 'نقد', date: j5.fr, heure: '08:45' }],
  })

  // Chèque avec justificatif, soldé plus tard en espèces.
  ajouterRecu({
    numero: 251,
    prenom: 'نادية',
    nom: 'بلقاسم',
    telephone: '0622-31.07.44',
    hotel: 'رايا مبارك',
    vol: 'الخطوط السعودية',
    chambre: '3',
    tarifCentimes: 4050000,
    reductionCentimes: 100000,
    rabatteur: 'صفية',
    date: j5.fr,
    heure: '10:02',
    employe: EMPLOYE,
    impressions: 2,
    paiements: [
      {
        montantCentimes: 2000000,
        nature: 'شيك',
        date: j5.fr,
        heure: '10:02',
        referenceInstrument: '4471182',
        dateInstrument: j5.fr,
        banque: 'البنك الشعبي',
      },
      { montantCentimes: 1950000, nature: 'نقد', date: j1.fr, heure: '11:30' },
    ],
  })

  // Deux versements espèces dans la même journée.
  ajouterRecu({
    numero: 252,
    prenom: 'رشيد',
    nom: 'الحسني',
    telephone: '0633-88.12.09',
    hotel: 'منار الشروق',
    vol: 'القطرية',
    chambre: '4',
    tarifCentimes: 2700000,
    rabatteur: 'بهي',
    date: j5.fr,
    heure: '14:20',
    employe: CAISSIERE,
    paiements: [
      { montantCentimes: 500000, nature: 'نقد', date: j5.fr, heure: '14:20' },
      { montantCentimes: 700000, nature: 'نقد', date: j5.fr, heure: '17:05' },
    ],
  })

  // Dossier mené jusqu'à six versements : le sixième solde exactement (R-20).
  ajouterRecu({
    numero: 253,
    prenom: 'سميرة',
    nom: 'مرزوق',
    telephone: '0644-70.55.31',
    hotel: 'واحة احياد',
    vol: 'الخطوط السعودية',
    chambre: '3',
    tarifCentimes: 4380000,
    reductionCentimes: 300000,
    rabatteur: 'بن سليمان',
    note: 'دفع على ست دفعات',
    date: j5.fr,
    heure: '15:30',
    employe: EMPLOYE,
    impressions: 3,
    paiements: [
      { montantCentimes: 800000, nature: 'نقد', date: j5.fr, heure: '15:30' },
      { montantCentimes: 700000, nature: 'نقد', date: j4.fr, heure: '09:50' },
      {
        montantCentimes: 700000,
        nature: 'شيك',
        date: j4.fr,
        heure: '16:15',
        referenceInstrument: '5510298',
        dateInstrument: j4.fr,
        banque: 'التجاري وفا بنك',
      },
      { montantCentimes: 700000, nature: 'نقد', date: j2.fr, heure: '10:40' },
      { montantCentimes: 600000, nature: 'نقد', date: j1.fr, heure: '09:05' },
      // Sixième versement : exactement le restant, ni plus ni moins.
      { montantCentimes: 580000, nature: 'نقد', date: j1.fr, heure: '16:50' },
    ],
  })

  // ============================================ J-4 — un chèque, trois reçus

  for (const [index, membre] of [
    { numero: 254, prenom: 'عبد الرحمان', nom: 'بنعني', tel: '0655-22.18.01', chambre: '4' },
    { numero: 255, prenom: 'حنان', nom: 'بنعني', tel: '0655-22.18.02', chambre: '4' },
    { numero: 256, prenom: 'كريم', nom: 'بنعني', tel: '0655-22.18.03', chambre: '5' },
  ].entries()) {
    const heure = `09:${String(20 + index * 6).padStart(2, '0')}`
    ajouterRecu({
      numero: membre.numero,
      prenom: membre.prenom,
      nom: membre.nom,
      telephone: membre.tel,
      hotel: 'واحة احياد',
      vol: 'الخطوط السعودية',
      chambre: membre.chambre,
      tarifCentimes: membre.chambre === '4' ? 3850000 : 3550000,
      rabatteur: 'بن سليمان',
      groupe: 'FAM-BENANI',
      date: j4.fr,
      heure,
      employe: EMPLOYE,
      paiements: [
        {
          montantCentimes: 3000000,
          nature: 'شيك',
          date: j4.fr,
          heure,
          referenceInstrument: chequeFamille.reference,
          dateInstrument: chequeFamille.dateInstrument,
          banque: chequeFamille.banque,
          portee: 'shared',
          operationPartageeId: chequeFamille.id,
          payeur: chequeFamille.payeur,
          montantOperationCentimes: chequeFamille.montantTotalCentimes,
        },
      ],
    })
  }

  // ========================================== J-3 — journée sans mouvement =
  // Volontairement vide : aucun reçu, aucun versement, aucune sortie de caisse.
  // Elle sert au filtre « masquer les journées sans mouvement » du suivi.

  // ==================================================== J-2 ================

  ajouterRecu({
    numero: 257,
    prenom: 'عادل',
    nom: 'الصقلي',
    telephone: '0666-14.29.83',
    hotel: 'رايا مبارك',
    vol: 'الخطوط السعودية',
    chambre: '4',
    tarifCentimes: 3350000,
    rabatteur: 'صفية',
    date: j2.fr,
    heure: '11:05',
    employe: EMPLOYE,
    paiements: [
      {
        montantCentimes: 2500000,
        nature: 'تحويل بنكي',
        date: j2.fr,
        heure: '11:05',
        referenceInstrument: virementReutilise.reference,
        dateInstrument: virementReutilise.dateInstrument,
        banque: virementReutilise.banque,
        portee: 'shared',
        operationPartageeId: virementReutilise.id,
        payeur: virementReutilise.payeur,
        montantOperationCentimes: virementReutilise.montantTotalCentimes,
      },
    ],
  })

  // Annulation avec sortie de caisse espèces (R-47).
  ajouterRecu({
    numero: 258,
    prenom: 'زينب',
    nom: 'بوعزة',
    telephone: '0677-45.12.88',
    hotel: 'منار الشروق',
    vol: 'القطرية',
    chambre: '5',
    tarifCentimes: 2600000,
    rabatteur: 'بهي',
    note: 'إلغاء مع استرجاع من الصندوق',
    date: j2.fr,
    heure: '09:40',
    employe: EMPLOYE,
    annulation: {
      motif: 'إلغاء السفر',
      par: EMPLOYE,
      date: j2.fr,
      heure: '17:40',
      cle: j2.cle,
      mode: 'cash',
    },
    paiements: [{ montantCentimes: 800000, nature: 'نقد', date: j2.fr, heure: '09:40' }],
  })

  // Homonyme du reçu 258 : même prénom, même nom, autre personne, autre
  // dossier. Le système ne doit jamais les rapprocher automatiquement.
  ajouterRecu({
    numero: 259,
    prenom: 'زينب',
    nom: 'بوعزة',
    telephone: '0699-02.77.14',
    hotel: 'منار الشروق',
    vol: 'الخطوط السعودية',
    chambre: '6',
    tarifCentimes: 2400000,
    rabatteur: 'بن شريفة',
    note: 'شخص آخر يحمل نفس الاسم — ملف مستقل',
    date: j2.fr,
    heure: '12:15',
    employe: CAISSIERE,
    paiements: [{ montantCentimes: 1200000, nature: 'نقد', date: j2.fr, heure: '12:15' }],
  })

  // ==================================================== J-1 ================

  // Réutilisation du virement de J-2 : une seconde attribution (R-31).
  ajouterRecu({
    numero: 260,
    prenom: 'سلمى',
    nom: 'العثماني',
    telephone: '0688-90.31.02',
    hotel: 'منار الشروق',
    vol: 'الخطوط السعودية',
    chambre: '3',
    tarifCentimes: 3380000,
    rabatteur: 'zemzem',
    groupe: 'FAM-OTHMANI',
    date: j1.fr,
    heure: '10:25',
    employe: EMPLOYE,
    paiements: [
      {
        montantCentimes: 2000000,
        nature: 'تحويل بنكي',
        date: j1.fr,
        heure: '10:25',
        referenceInstrument: virementReutilise.reference,
        dateInstrument: virementReutilise.dateInstrument,
        banque: virementReutilise.banque,
        portee: 'shared',
        operationPartageeId: virementReutilise.id,
        payeur: virementReutilise.payeur,
        montantOperationCentimes: virementReutilise.montantTotalCentimes,
      },
    ],
  })

  // Chèque unique **sans** justificatif : alimente « شيكات بدون صورة ».
  ajouterRecu({
    numero: 261,
    prenom: 'مراد',
    nom: 'الزياني',
    telephone: '0611-77.40.28',
    hotel: 'منار الشروق',
    vol: 'القطرية',
    chambre: '3',
    tarifCentimes: 3150000,
    rabatteur: 'بن شريفة',
    note: 'صورة الشيك لم تُضف بعد',
    date: j1.fr,
    heure: '11:50',
    employe: CAISSIERE,
    paiements: [
      {
        montantCentimes: 1500000,
        nature: 'شيك',
        date: j1.fr,
        heure: '11:50',
        referenceInstrument: '6620944',
        dateInstrument: j1.fr,
        banque: 'التجاري وفا بنك',
      },
    ],
  })

  // Attribution dépassant le total de l'opération, confirmée par la direction :
  // le restant de l'opération devient négatif et s'affiche en rouge (R-32).
  ajouterRecu({
    numero: 262,
    prenom: 'إدريس',
    nom: 'الفاسي',
    telephone: '0622-55.18.60',
    hotel: 'منار الشروق',
    vol: 'الخطوط السعودية',
    chambre: '4',
    tarifCentimes: 2600000,
    rabatteur: 'بهي',
    note: 'تجاوز مؤكد على العملية المشتركة',
    date: j1.fr,
    heure: '15:40',
    employe: DIRECTEUR,
    paiements: [
      {
        montantCentimes: 1500000,
        nature: 'شيك',
        date: j1.fr,
        heure: '15:40',
        referenceInstrument: chequeDepasse.reference,
        dateInstrument: chequeDepasse.dateInstrument,
        banque: chequeDepasse.banque,
        portee: 'shared',
        operationPartageeId: chequeDepasse.id,
        payeur: chequeDepasse.payeur,
        montantOperationCentimes: chequeDepasse.montantTotalCentimes,
      },
    ],
  })

  // Reçu modifié deux fois, avec son historique complet (R-49 à R-55).
  ajouterRecu({
    numero: 263,
    prenom: 'خديجة',
    nom: 'فهمي',
    telephone: '0633-41.20.77',
    hotel: 'واحة احياد',
    vol: 'الخطوط السعودية',
    chambre: '4',
    tarifCentimes: 3850000,
    reductionCentimes: 150000,
    rabatteur: 'صفية',
    groupe: 'FAM-FEHMI',
    note: 'تم تصحيح الاسم والبرنامج',
    date: j1.fr,
    heure: '08:30',
    employe: EMPLOYE,
    derniereModification: `${j1.fr} 14:10`,
    modifiePar: DIRECTEUR,
    modifications: [
      {
        id: 'mod-demo-263-2',
        section: 'program',
        sectionLibelle: 'البرنامج والسعر',
        changements: [
          { champ: 'الغرفة', ancienne: '5', nouvelle: '4' },
          { champ: 'الثمن الأصلي', ancienne: '⁦35 500 DH⁩', nouvelle: '⁦38 500 DH⁩' },
          { champ: 'المبلغ المتفق عليه', ancienne: '⁦34 000 DH⁩', nouvelle: '⁦37 000 DH⁩' },
        ],
        motif: 'الزبونة طلبت غرفة لأربعة أشخاص',
        employe: DIRECTEUR,
        dateHeure: `${j1.fr} 14:10`,
      },
      {
        id: 'mod-demo-263-1',
        section: 'identity',
        sectionLibelle: 'الهوية',
        changements: [{ champ: 'النسب', ancienne: 'فهمى', nouvelle: 'فهمي' }],
        motif: 'خطأ إملائي عند التسجيل',
        employe: EMPLOYE,
        dateHeure: `${j1.fr} 09:15`,
      },
    ],
    paiements: [{ montantCentimes: 1000000, nature: 'نقد', date: j1.fr, heure: '08:30' }],
  })

  // Versement enregistré **après** l'impression du journal de J-1 : il
  // ressortira en anomalie sur cette journée (R-63, R-64).
  ajouterRecu({
    numero: 264,
    prenom: 'حسن',
    nom: 'المرابط',
    telephone: '0611-95.02.46',
    hotel: 'منار الشروق',
    vol: 'القطرية',
    chambre: '6',
    tarifCentimes: 2500000,
    rabatteur: 'بهي',
    note: 'مسجل بعد طباعة يومية أمس',
    date: j1.fr,
    heure: '19:25',
    employe: CAISSIERE,
    paiements: [{ montantCentimes: 600000, nature: 'نقد', date: j1.fr, heure: '19:25' }],
  })

  // ==================================================== J0 — aujourd'hui ===

  ajouterRecu({
    numero: 265,
    prenom: 'أمينة',
    nom: 'الركراكي',
    telephone: '0644-08.55.19',
    hotel: 'رايا مبارك',
    vol: 'الخطوط السعودية',
    chambre: '2',
    tarifCentimes: 4850000,
    reductionCentimes: 200000,
    rabatteur: 'zemzem',
    date: j0.fr,
    heure: '09:10',
    employe: EMPLOYE,
    paiements: [{ montantCentimes: 1800000, nature: 'نقد', date: j0.fr, heure: '09:10' }],
  })

  // Reçu portant un passeport saisi (R-90).
  ajouterRecu({
    numero: 266,
    prenom: 'يوسف',
    nom: 'بنعمر',
    telephone: '0655-63.90.28',
    hotel: 'منار الشروق',
    vol: 'الخطوط السعودية',
    chambre: '7',
    tarifCentimes: 2400000,
    rabatteur: 'بن سليمان',
    note: 'الجواز مسجل',
    date: j0.fr,
    heure: '10:35',
    employe: CAISSIERE,
    passeport: {
      prenom: 'يوسف',
      nom: 'بنعمر',
      numero: 'UZ4471820',
      nationalite: 'المغربية',
      dateNaissance: '14/03/1986',
      lieuNaissance: 'الدار البيضاء',
      dateEmission: '02/06/2022',
      dateExpiration: '01/06/2027',
      paysEmission: 'MAR',
      sexe: 'M',
      mrz: 'P<MARBENAMER<<YOUSSEF<<<<<<<<<<<<<<<<<<<<<<<',
      imageOriginale: null,
      imagePortrait: null,
      scanId: 'scan-demo-266',
      resultatBrut: { source: 'prototype-upload', recuLe: `${j0.fr} 10:35` },
    },
    paiements: [
      {
        montantCentimes: 1200000,
        nature: 'تحويل بنكي',
        date: j0.fr,
        heure: '10:35',
        referenceInstrument: 'VIR-2026-0912',
        dateInstrument: j0.fr,
        banque: 'بنك المغرب',
      },
    ],
  })

  // Annulation sans sortie de caisse (R-47) : rien ne sort du tiroir.
  ajouterRecu({
    numero: 267,
    prenom: 'لبنى',
    nom: 'الطاهري',
    telephone: '0688-33.09.71',
    hotel: 'منار الشروق',
    vol: 'الخطوط السعودية',
    chambre: '6',
    tarifCentimes: 2400000,
    rabatteur: 'بن شريفة',
    note: 'إلغاء قبل التحصيل البنكي — لا خروج من الصندوق',
    date: j0.fr,
    heure: '10:20',
    employe: DIRECTEUR,
    annulation: {
      motif: 'إلغاء قبل التحصيل البنكي',
      par: DIRECTEUR,
      date: j0.fr,
      heure: '15:10',
      cle: j0.cle,
      mode: 'none',
    },
    paiements: [
      {
        montantCentimes: 900000,
        nature: 'شيك',
        date: j0.fr,
        heure: '10:20',
        referenceInstrument: '5580142',
        dateInstrument: j0.fr,
        banque: 'بنك المغرب',
      },
    ],
  })

  // =============================================== Impressions du journal ==
  // Une impression par journée active. Celle de J-1 précède le versement du
  // reçu 264, qui ressort donc en anomalie sur cette journée.
  const impressionsFinance: ImpressionFinance[] = [
    {
      id: 'fp-demo-j5',
      jour: j5.cle,
      imprimeLe: `${j5.fr} 18:30`,
      employe: EMPLOYE,
      numeroImpression: 1,
      mouvementIds: [
        'p-demo-250-1',
        'p-demo-251-1',
        'p-demo-252-1',
        'p-demo-252-2',
        'p-demo-253-1',
      ].sort(),
      nombreLignes: 5,
    },
    {
      id: 'fp-demo-j4',
      jour: j4.cle,
      imprimeLe: `${j4.fr} 18:05`,
      employe: EMPLOYE,
      numeroImpression: 1,
      mouvementIds: [
        'p-demo-253-2',
        'p-demo-253-3',
        'p-demo-254-1',
        'p-demo-255-1',
        'p-demo-256-1',
      ].sort(),
      nombreLignes: 5,
    },
    {
      id: 'fp-demo-j2',
      jour: j2.cle,
      imprimeLe: `${j2.fr} 18:20`,
      employe: CAISSIERE,
      numeroImpression: 1,
      mouvementIds: [
        'p-demo-253-4',
        'p-demo-257-1',
        'p-demo-258-1',
        'p-demo-259-1',
        'refund-demo-258',
      ].sort(),
      nombreLignes: 5,
    },
    // Journée imprimée deux fois : le code d'impression passe à « 02 ».
    ...[1, 2].map((numeroImpression) => ({
      id: `fp-demo-j1-${numeroImpression}`,
      jour: j1.cle,
      imprimeLe: `${j1.fr} ${numeroImpression === 1 ? '17:00' : '18:45'}`,
      employe: numeroImpression === 1 ? EMPLOYE : DIRECTEUR,
      numeroImpression,
      mouvementIds: [
        'p-demo-251-2',
        'p-demo-253-5',
        'p-demo-253-6',
        'p-demo-260-1',
        'p-demo-261-1',
        'p-demo-262-1',
        'p-demo-263-1',
      ].sort(),
      nombreLignes: 7,
    })),
  ]

  // --- Scénario de pagination, jamais actif par défaut ---------------------
  let dernierNumero = 268
  if (scenario === 'pagination') {
    const volume = construireJourneeVolumineuse(j5.fr, EMPLOYE, 300)
    recus.push(...volume.recus)
    clients.push(...volume.clients)
    dernierNumero = volume.prochainNumero
    for (const recu of volume.recus) {
      if (recu.modeRemboursement !== 'cash') continue
      mouvementsCaisse.push({
        id: `refund-volume-${recu.numero}`,
        type: 'refund_cash',
        jour: j5.cle,
        date: j5.fr,
        heure: recu.annuleLe?.split(' ')[1] ?? '18:00',
        montantCentimes: recu.montantRembourseCentimes ?? 0,
        recuNumero: recu.numero,
        client: `${recu.prenom} ${recu.nom}`,
        employe: EMPLOYE,
      })
    }
  }

  const audit: EntreeAudit[] = [
    {
      id: 'audit-demo-6',
      horodatage: `${j0.fr} 15:10`,
      action: 'إلغاء',
      detail: 'وصل 267 — إلغاء قبل التحصيل البنكي — خارج الصندوق',
      utilisateur: DIRECTEUR,
    },
    {
      id: 'audit-demo-5',
      horodatage: `${j0.fr} 10:35`,
      action: 'إنشاء',
      detail: 'وصل 266 — يوسف بنعمر — ⁦12 000 DH⁩',
      utilisateur: CAISSIERE,
    },
    {
      id: 'audit-demo-4',
      horodatage: `${j1.fr} 18:45`,
      action: 'طباعة الصندوق',
      detail: `${j1.fr} — 02 — 7 حركة`,
      utilisateur: DIRECTEUR,
    },
    {
      id: 'audit-demo-3',
      horodatage: `${j1.fr} 16:50`,
      action: 'دفعة',
      detail: 'وصل 253 — دفعة 6 — ⁦5 800 DH⁩',
      utilisateur: EMPLOYE,
    },
    {
      id: 'audit-demo-2',
      horodatage: `${j1.fr} 14:10`,
      action: 'تعديل',
      detail: 'وصل 263 — البرنامج والسعر — الغرفة : 5 → 4 — السبب: الزبونة طلبت غرفة لأربعة أشخاص',
      utilisateur: DIRECTEUR,
    },
    {
      id: 'audit-demo-1',
      horodatage: `${j5.fr} 08:00`,
      action: 'Données de démonstration',
      detail:
        scenario === 'pagination'
          ? 'Six journées de cas métier, plus une journée chargée pour la pagination'
          : 'Six journées couvrant les cas métier caractéristiques',
      utilisateur: 'Système',
    },
  ]

  // Justificatifs amorcés. Le chèque de famille et le virement réutilisé en
  // portent un ; le chèque 6620944 n'en a délibérément aucun.
  const imagesAmorcees: ImageAmorcee[] = [
    {
      cible: `operation:${chequeFamille.id}`,
      reference: chequeFamille.reference,
      banque: chequeFamille.banque,
      montantCentimes: chequeFamille.montantTotalCentimes,
      payeur: chequeFamille.payeur,
      date: chequeFamille.dateInstrument,
      virement: false,
    },
    {
      cible: `operation:${virementReutilise.id}`,
      reference: virementReutilise.reference,
      banque: virementReutilise.banque,
      montantCentimes: virementReutilise.montantTotalCentimes,
      payeur: virementReutilise.payeur,
      date: virementReutilise.dateInstrument,
      virement: true,
    },
    {
      cible: 'versement:r-demo-251:p-demo-251-1',
      reference: '4471182',
      banque: 'البنك الشعبي',
      montantCentimes: 2000000,
      payeur: 'نادية بلقاسم',
      date: j5.fr,
      virement: false,
    },
  ]

  return {
    prochainNumero: dernierNumero,
    imagesAmorcees,
    recus,
    clients,
    operationsPartagees: [chequeFamille, virementReutilise, chequeDepasse],
    mouvementsCaisse,
    impressionsFinance,
    audit,
  }
}
