/**
 * Jeu de démonstration volumineux — une journée chargée.
 *
 * ⚠️ ISOLATION — Ce fichier ne sert qu'à vérifier la pagination de
 * l'impression du journal financier (R-67 : 31 lignes par page). Il est
 * retirable en supprimant ce fichier et le seul appel qui y renvoie, à la fin
 * de `construireJeuDemonstration()`. Aucune règle métier n'en dépend, et rien
 * dans `domain/` ni dans `ui/` n'y fait référence.
 *
 * Les reçus produits sont ordinaires : espèces, chèque ou virement, un seul
 * versement chacun, plus deux annulations le même jour pour vérifier le
 * placement du tableau des annulations à cheval sur deux pages.
 */

import type { Client, Recu, Versement } from '../../domain/types'

/** Valeurs tournantes, reprises des référentiels de démonstration. */
const HOTELS = ['منار الشروق', 'رايا مبارك', 'واحة احياد']
const VOLS = ['الخطوط السعودية', 'القطرية']
const CHAMBRES = ['3', '4', '5', '6']
const RABATTEURS = ['zemzem', 'صفية', 'بن سليمان', 'بهي', 'بن شريفة']
const PRENOMS = ['ياسين', 'نادية', 'رشيد', 'سميرة', 'عادل', 'حنان', 'كريم', 'زينب']
const NOMS = ['العامري', 'بلقاسم', 'الحسني', 'مرزوق', 'الصقلي', 'بوعزة']
const BANQUES = ['البنك الشعبي', 'التجاري وفا بنك', 'بنك المغرب']

export interface JourneeVolumineuse {
  recus: Recu[]
  clients: Client[]
  prochainNumero: number
}

/**
 * Construit une journée de trente reçus, dont deux annulés le même jour.
 *
 * @param dateFr    Journée visée, au format `jj/mm/aaaa`.
 * @param employe   Employé enregistrant les versements.
 * @param premierNumero Premier numéro de reçu à utiliser.
 */
export function construireJourneeVolumineuse(
  dateFr: string,
  employe: string,
  premierNumero: number,
): JourneeVolumineuse {
  const recus: Recu[] = []
  const clients: Client[] = []
  const NOMBRE = 30

  for (let index = 0; index < NOMBRE; index += 1) {
    const numero = premierNumero + index
    const prenom = PRENOMS[index % PRENOMS.length]
    const nom = NOMS[index % NOMS.length]
    const hotel = HOTELS[index % HOTELS.length]
    const vol = VOLS[index % VOLS.length]
    const chambre = CHAMBRES[index % CHAMBRES.length]
    const rabatteur = RABATTEURS[index % RABATTEURS.length]
    const heure = `${String(8 + Math.floor(index / 4)).padStart(2, '0')}:${String(
      (index % 4) * 15,
    ).padStart(2, '0')}`

    const convenuCentimes = 2400000 + (index % 6) * 150000
    const montantCentimes = 500000 + (index % 5) * 100000
    const restantApresCentimes = convenuCentimes - montantCentimes

    const nature = index % 3 === 0 ? 'نقد' : index % 3 === 1 ? 'شيك' : 'تحويل بنكي'
    const estBancaire = nature !== 'نقد'

    const versement: Versement = {
      id: `p-volume-${numero}-1`,
      rang: 1,
      montantCentimes,
      nature,
      date: dateFr,
      heure,
      dateHeure: `${dateFr} ${heure}`,
      enregistrePar: employe,
      referenceInstrument: estBancaire ? String(6100000 + numero) : '',
      dateInstrument: estBancaire ? dateFr : '',
      banque: estBancaire ? BANQUES[index % BANQUES.length] : '',
      portee: 'unique',
      operationPartageeId: '',
      payeur: '',
      montantOperationCentimes: 0,
      image: null,
      instantane: {
        client: `${prenom} ${nom}`,
        hotel,
        chambre,
        vol,
        programme: `${hotel} / غرفة ${chambre} / ${vol}`,
        convenuCentimes,
        rabatteur,
        restantApresCentimes,
        statutApres: restantApresCentimes <= 0 ? '✓' : '•',
      },
    }

    // Deux reçus de la journée sont annulés, l'un avec sortie de caisse.
    const annule = index === 11 || index === 24
    const clientId = `CLI-VOLUME-${String(numero).padStart(6, '0')}`

    const recu: Recu = {
      id: `r-volume-${numero}`,
      numero,
      clientId,
      passeport: null,
      prenom,
      nom,
      telephone: `06${String(10 + (index % 80)).padStart(2, '0')}-00.00.${String(index).padStart(2, '0')}`,
      hotel,
      vol,
      chambre,
      tarifCentimes: convenuCentimes,
      reductionCentimes: 0,
      convenuCentimes,
      rabatteur,
      groupe: '',
      note: 'DEMO — journée de volume, vérification de la pagination',
      date: dateFr,
      creeLe: `${dateFr} ${heure}`,
      employe,
      statut: annule ? 'ملغى' : 'نشط',
      motifAnnulation: annule ? 'إلغاء السفر' : '',
      annulePar: annule ? employe : undefined,
      annuleLe: annule ? `${dateFr} 18:${String(10 + index).padStart(2, '0')}` : undefined,
      modeRemboursement: annule ? (index === 11 ? 'cash' : 'none') : undefined,
      montantRembourseCentimes: annule && index === 11 ? montantCentimes : undefined,
      impressions: 0,
      modifications: [],
      versements: [versement],
    }

    recus.push(recu)
    clients.push({
      id: clientId,
      nom,
      prenom,
      photoUrl: '',
      passeport: null,
      creeLe: recu.creeLe,
      creePar: employe,
      recuIds: [recu.id],
    })
  }

  return { recus, clients, prochainNumero: premierNumero + NOMBRE }
}
