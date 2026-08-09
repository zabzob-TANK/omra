/**
 * Constructeurs d'objets pour les tests du noyau métier.
 *
 * Ce fichier ne contient aucune règle : uniquement de quoi fabriquer des reçus
 * et des versements plausibles sans répéter vingt champs à chaque test.
 */

import type { OperationPartagee, Recu, Tarif, Versement } from '../types'
import type { SaisieInstrument } from './instrument'

export function unVersement(partiel: Partial<Versement> = {}): Versement {
  const montantCentimes = partiel.montantCentimes ?? 1000000
  return {
    id: 'v-1',
    rang: 1,
    montantCentimes,
    nature: 'نقد',
    date: '01/08/2026',
    heure: '10:00',
    dateHeure: '01/08/2026 10:00',
    enregistrePar: 'سمير بنعلي',
    referenceInstrument: '',
    dateInstrument: '',
    banque: '',
    portee: 'unique',
    operationPartageeId: '',
    payeur: '',
    montantOperationCentimes: 0,
    image: null,
    instantane: {
      client: 'سعيدة شقير',
      hotel: 'منار الشروق',
      chambre: '4',
      vol: 'الخطوط السعودية',
      programme: 'منار الشروق / غرفة 4 / الخطوط السعودية',
      convenuCentimes: 2600000,
      rabatteur: 'zemzem',
      restantApresCentimes: 2600000 - montantCentimes,
      statutApres: '•',
    },
    ...partiel,
  }
}

export function unRecu(partiel: Partial<Recu> = {}): Recu {
  return {
    id: 'r-1',
    numero: 262,
    clientId: 'CLI-1',
    passeport: null,
    prenom: 'سعيدة',
    nom: 'شقير',
    telephone: '0611-00.75.00',
    hotel: 'منار الشروق',
    vol: 'الخطوط السعودية',
    chambre: '4',
    tarifCentimes: 2600000,
    reductionCentimes: 0,
    convenuCentimes: 2600000,
    rabatteur: 'zemzem',
    groupe: '',
    note: '',
    date: '01/08/2026',
    creeLe: '01/08/2026 10:00',
    employe: 'سمير بنعلي',
    statut: 'نشط',
    motifAnnulation: '',
    impressions: 0,
    modifications: [],
    nombreModifications: 0,
    anomalies: [],
    versements: [unVersement()],
    ...partiel,
  }
}

export function uneOperation(partiel: Partial<OperationPartagee> = {}): OperationPartagee {
  return {
    id: 'SOP-1',
    nature: 'تحويل بنكي',
    reference: 'VIR-001',
    dateInstrument: '01/08/2026',
    banque: 'التجاري وفا بنك',
    payeur: 'عبد الله العثماني',
    montantTotalCentimes: 5000000,
    creeeLe: '01/08/2026 14:00',
    creeePar: 'سمير بنعلي',
    statut: 'active',
    image: null,
    ...partiel,
  }
}

/** Grille minimale : une seule combinaison définie, pour éprouver les absences. */
export const TARIFS_TEST: Tarif[] = [
  {
    saisonId: 's1',
    hotelId: 'منار الشروق',
    volId: 'الخطوط السعودية',
    chambreId: '4',
    montantCentimes: 2600000,
  },
  {
    saisonId: 's1',
    hotelId: 'منار الشروق',
    volId: 'الخطوط السعودية',
    chambreId: '2',
    montantCentimes: 3480000,
  },
]

export function saisieEspeces(partiel: Partial<SaisieInstrument> = {}): SaisieInstrument {
  return {
    nature: 'نقد',
    portee: 'unique',
    sourceOperation: 'new',
    operationId: '',
    reference: '',
    dateInstrument: '',
    banque: '',
    payeur: '',
    montantOperation: '',
    ...partiel,
  }
}

export function saisieCheque(partiel: Partial<SaisieInstrument> = {}): SaisieInstrument {
  return saisieEspeces({
    nature: 'شيك',
    reference: '4471182',
    dateInstrument: '02/07/2025',
    banque: 'البنك الشعبي',
    ...partiel,
  })
}

export const CONTEXTE_PREPARATION = {
  operations: [] as OperationPartagee[],
  versements: [] as Versement[],
  nouvelIdOperation: () => 'SOP-NOUVELLE',
  horodatage: '01/08/2026 12:00',
  employe: 'سمير بنعلي',
}
