/**
 * Constantes reprises telles quelles du fichier de référence `Zemzem Asfar.dc.html`.
 *
 * Couvre : C-01 à C-09.
 *
 * IMPORTANT — Les valeurs C-01 à C-06 sont des **référentiels** qui existent déjà
 * dans Omra (saisons, hôtels, vols, chambres, rabatteurs, tarifs). Elles ne sont
 * reproduites ici que pour alimenter l'adaptateur de démonstration et pour servir
 * de contrat de forme. Le code métier ne doit JAMAIS les importer directement :
 * il passe par `ReferentielsPort` (voir `modules/facturation/data/ports.ts`).
 */

/** C-07 — Nombre maximal de versements par reçu. Règle bloquante (R-18, R-20). */
export const MAX_VERSEMENTS = 6

/**
 * C-09 — Tout caractère hors plages arabes est retiré à la frappe.
 * Prototype : `AR_RE`.
 */
export const CARACTERES_NON_ARABES =
  /[^\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\s]/g

/** Natures de paiement normalisées. Prototype : `receiptMethodLabel`. */
export const NATURE_ESPECES = 'نقد'
export const NATURE_CHEQUE = 'شيك'
export const NATURE_VIREMENT = 'تحويل بنكي'

/** Statuts de reçu. Prototype : `stat()`. */
export const STATUT_ANNULE = 'ملغى'
export const STATUT_SOLDE = 'مسدد'
export const STATUT_INCOMPLET = 'غير مكتمل'
export const STATUT_ACTIF = 'نشط'

/** C-01 — Hôtels du prototype (démonstration uniquement). */
export const HOTELS_DEMO = ['منار الشروق', 'رايا مبارك', 'واحة احياد'] as const

/** C-02 — Compagnies aériennes du prototype (démonstration uniquement). */
export const VOLS_DEMO = ['الخطوط السعودية', 'القطرية'] as const

/** C-03 — Types de chambre du prototype (démonstration uniquement). */
export const CHAMBRES_DEMO = ['2', '3', '4', '5', '6', '7'] as const

/** C-04 — Rabatteurs du prototype (démonstration uniquement). */
export const RABATTEURS_DEMO = [
  'zemzem',
  'صفية',
  'بن سليمان',
  'بن شريفة',
  'بهي',
] as const

/**
 * C-05 — Grille tarifaire du prototype, en centimes, indexée `hôtel|vol` puis chambre.
 *
 * Observation O-08 : seules 4 des 6 combinaisons hôtel × vol sont renseignées.
 * Conservée telle quelle — une combinaison absente doit bloquer (R-05).
 */
export const TARIFS_DEMO: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'منار الشروق|الخطوط السعودية': { 2: 34800, 3: 33800, 4: 26000, 5: 25000, 6: 24000, 7: 24000 },
  'منار الشروق|القطرية': { 2: 35500, 3: 31500, 4: 27000, 5: 26000, 6: 25000, 7: 25000 },
  'رايا مبارك|الخطوط السعودية': { 2: 48500, 3: 40500, 4: 33500, 5: 33500 },
  'واحة احياد|الخطوط السعودية': { 2: 53500, 3: 43800, 4: 38500, 5: 35500 },
}

/**
 * C-06 — Saison du prototype (démonstration uniquement).
 * `reductionMax` est en centimes : 300 000 c = 3 000 DH (R-06).
 */
export const SAISON_DEMO = {
  nom: 'عمرة رمضان 2027',
  reductionMaxCentimes: 300000,
  duree: '60 يوم',
} as const

/**
 * C-08 — Comptes du prototype.
 *
 * Le fichier de référence embarque deux comptes de démonstration avec leurs mots
 * de passe en clair. Ils ne sont **pas** reproduits ici : aucun identifiant ne
 * doit figurer dans le code (observation O-03). L'authentification passe par
 * `SessionPort`, branché sur les comptes Omra existants.
 *
 * Seuls les rôles sont conservés, car ils portent une règle métier (R-39, R-61, R-65).
 */
export const ROLE_ADMINISTRATEUR = 'مدير'
export const ROLE_CAISSE = 'صندوق'
