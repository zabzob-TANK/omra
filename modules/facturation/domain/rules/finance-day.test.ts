import { describe, expect, it } from 'vitest'

import type { ImpressionFinance, MouvementCaisse, Recu } from '../types'
import { unRecu, unVersement } from './fixtures'
import { versementsSaisonDepuisRecu } from './cheque-register'
import {
  anomaliesCandidates,
  anomaliesEnAttente,
  annulationsDeLaPeriode,
  badgeVersement,
  bornesWeekEnd,
  badgeSansCadreALImpression,
  codeImpression,
  codeImpressionBandeau,
  codeMode,
  collecterMouvements,
  dansLaPeriode,
  etatImpression,
  etatVeille,
  identifiantMouvement,
  LIGNES_PAR_PAGE_IMPRIMEE,
  nombreDePages,
  peutImprimer,
  totalAnnuleCentimes,
  totalReelOperations,
  totauxFinance,
  trierMouvements,
} from './finance-day'

/** 1er août 2026, un samedi. */
const MAINTENANT = new Date(2026, 7, 1, 12, 0, 0)

function recuAvec(versements: ReturnType<typeof unVersement>[], partiel = {}) {
  return unRecu({ versements, ...partiel })
}

/**
 * `collecterMouvements` attend désormais des `VersementSaison[]` (décision
 * de performance du 2026-08-09), jamais des `Recu[]`.
 */
function aVersements(recus: readonly Recu[]) {
  return recus.flatMap((r) => versementsSaisonDepuisRecu(r, []))
}

describe('R-56 — sélection de la période', () => {
  it('retient la journée choisie', () => {
    expect(dansLaPeriode('2026-08-01', { filtre: 'day', jour: '2026-08-01' }, MAINTENANT)).toBe(true)
    expect(dansLaPeriode('2026-07-31', { filtre: 'day', jour: '2026-08-01' }, MAINTENANT)).toBe(
      false,
    )
  })

  it('retient la journée courante quand aucune n’est précisée', () => {
    expect(dansLaPeriode('2026-08-01', { filtre: 'day' }, MAINTENANT)).toBe(true)
  })

  it('retient tout avec le filtre « الكل »', () => {
    expect(dansLaPeriode('2020-01-01', { filtre: 'all' }, MAINTENANT)).toBe(true)
  })

  it('retient les deux jours du week-end', () => {
    const { debut, fin } = bornesWeekEnd(MAINTENANT)
    expect(debut).toBe('2026-08-01')
    expect(fin).toBe('2026-08-02')
    expect(dansLaPeriode('2026-08-02', { filtre: 'weekend' }, MAINTENANT)).toBe(true)
    expect(dansLaPeriode('2026-07-31', { filtre: 'weekend' }, MAINTENANT)).toBe(false)
  })

  it('accepte des bornes personnalisées dans les deux ordres', () => {
    const periode = { filtre: 'custom' as const, du: '2026-08-05', au: '2026-08-01' }
    expect(dansLaPeriode('2026-08-03', periode, MAINTENANT)).toBe(true)
    expect(dansLaPeriode('2026-08-06', periode, MAINTENANT)).toBe(false)
  })

  it('ne retient rien si aucune borne n’est saisie', () => {
    expect(dansLaPeriode('2026-08-01', { filtre: 'custom' }, MAINTENANT)).toBe(false)
  })

  it('ne retient jamais une journée vide', () => {
    expect(dansLaPeriode('', { filtre: 'all' }, MAINTENANT)).toBe(false)
  })
})

describe('collecte et tri des mouvements', () => {
  const recu = recuAvec([
    unVersement({ id: 'v-1', rang: 1, date: '01/08/2026', heure: '09:00' }),
    unVersement({ id: 'v-2', rang: 2, date: '01/08/2026', heure: '14:00' }),
  ])

  it('produit un mouvement par versement', () => {
    expect(collecterMouvements(aVersements([recu]))).toHaveLength(2)
  })

  it('reprend l’identifiant du versement', () => {
    expect(identifiantMouvement(recu.id, recu.versements[0], 0)).toBe('v-1')
  })

  it('classe du plus récent au plus ancien', () => {
    const tries = trierMouvements(collecterMouvements(aVersements([recu])))
    expect(tries[0].heure).toBe('14:00')
    expect(tries[1].heure).toBe('09:00')
  })

  it('rattache les versements partagés à la même opération', () => {
    const partage = recuAvec([
      unVersement({
        id: 'v-a',
        nature: 'شيك',
        portee: 'shared',
        operationPartageeId: 'SOP-1',
        montantOperationCentimes: 5000000,
      }),
    ])
    const autre = recuAvec([
      unVersement({
        id: 'v-b',
        nature: 'شيك',
        portee: 'shared',
        operationPartageeId: 'SOP-1',
        montantOperationCentimes: 5000000,
      }),
    ])
    const mouvements = collecterMouvements(aVersements([partage, autre]))
    expect(new Set(mouvements.map((m) => m.cleOperation)).size).toBe(1)
  })

  it('donne une clé distincte à chaque instrument unique', () => {
    const a = recuAvec([unVersement({ id: 'v-a', nature: 'شيك' })])
    const b = recuAvec([unVersement({ id: 'v-b', nature: 'شيك' })])
    const mouvements = collecterMouvements(aVersements([a, b]))
    expect(new Set(mouvements.map((m) => m.cleOperation)).size).toBe(2)
  })
})

describe('R-58 — codes de mode', () => {
  it('marque les espèces', () => {
    expect(codeMode(unVersement({ nature: 'نقد' }))).toBe('E')
  })

  it('distingue chèque unique et partagé', () => {
    expect(codeMode(unVersement({ nature: 'شيك' }))).toBe('CH')
    expect(codeMode(unVersement({ nature: 'شيك', portee: 'shared' }))).toBe('CH-P')
  })

  it('distingue virement unique et partagé', () => {
    expect(codeMode(unVersement({ nature: 'تحويل بنكي' }))).toBe('V')
    expect(
      codeMode(unVersement({ nature: 'تحويل بنكي', montantOperationCentimes: 100 })),
    ).toBe('V-P')
  })
})

describe('R-59 — badge de versement', () => {
  it('marque le premier versement d’un N', () => {
    expect(badgeVersement(0)).toBe('N')
  })

  it('affiche le rang pour les suivants', () => {
    expect(badgeVersement(1)).toBe('2')
    expect(badgeVersement(5)).toBe('6')
  })
})

describe('R-34 — une opération partagée ne compte qu’une fois', () => {
  const partagee = [
    unVersement({
      id: 'a',
      nature: 'شيك',
      montantCentimes: 2500000,
      portee: 'shared',
      operationPartageeId: 'SOP-1',
      montantOperationCentimes: 5000000,
    }),
    unVersement({
      id: 'b',
      nature: 'شيك',
      montantCentimes: 2500000,
      portee: 'shared',
      operationPartageeId: 'SOP-1',
      montantOperationCentimes: 5000000,
    }),
  ]

  it('retient le montant de l’opération, pas la somme des parts', () => {
    const mouvements = collecterMouvements(aVersements([recuAvec([partagee[0]]), recuAvec([partagee[1]])]))
    expect(totalReelOperations(mouvements)).toBe(5000000)
  })

  it('retient la somme distribuée quand aucun montant d’opération n’est déclaré', () => {
    const mouvements = collecterMouvements(aVersements([
      recuAvec([unVersement({ id: 'x', nature: 'شيك', montantCentimes: 900000 })]),
    ]))
    expect(totalReelOperations(mouvements)).toBe(900000)
  })

  it('additionne deux opérations distinctes', () => {
    const mouvements = collecterMouvements(aVersements([
      recuAvec([unVersement({ id: 'x', nature: 'شيك', montantCentimes: 900000 })]),
      recuAvec([unVersement({ id: 'y', nature: 'شيك', montantCentimes: 100000 })]),
    ]))
    expect(totalReelOperations(mouvements)).toBe(1000000)
  })
})

describe('R-48, R-57 — totaux de la période', () => {
  const mouvements = collecterMouvements(aVersements([
    recuAvec([unVersement({ id: 'e1', nature: 'نقد', montantCentimes: 1000000 })]),
    recuAvec([unVersement({ id: 'c1', nature: 'شيك', montantCentimes: 500000 })]),
    recuAvec([unVersement({ id: 'v1', nature: 'تحويل بنكي', montantCentimes: 300000 })]),
  ]))
  const remboursement: MouvementCaisse = {
    id: 'r1',
    type: 'refund_cash',
    jour: '2026-08-01',
    date: '01/08/2026',
    heure: '17:40',
    montantCentimes: 200000,
    recuNumero: 262,
    client: 'x',
    employe: 'y',
  }

  it('affiche les espèces nettes des remboursements', () => {
    const totaux = totauxFinance(mouvements, [remboursement])
    expect(totaux.especesBrutCentimes).toBe(1000000)
    expect(totaux.remboursementsCentimes).toBe(200000)
    expect(totaux.especesNettesCentimes).toBe(800000)
  })

  it('additionne espèces nettes, chèques et virements', () => {
    const totaux = totauxFinance(mouvements, [remboursement])
    expect(totaux.totalGeneralCentimes).toBe(800000 + 500000 + 300000)
  })

  it('compte les opérations bancaires, pas les versements', () => {
    const partage = collecterMouvements(aVersements([
      recuAvec([
        unVersement({
          id: 'p1',
          nature: 'شيك',
          portee: 'shared',
          operationPartageeId: 'SOP-9',
          montantOperationCentimes: 400000,
          montantCentimes: 200000,
        }),
      ]),
      recuAvec([
        unVersement({
          id: 'p2',
          nature: 'شيك',
          portee: 'shared',
          operationPartageeId: 'SOP-9',
          montantOperationCentimes: 400000,
          montantCentimes: 200000,
        }),
      ]),
    ]))
    expect(totauxFinance(partage, []).nombreOperationsCheque).toBe(1)
  })
})

describe('R-48 — annulations de la période', () => {
  const annule = unRecu({
    id: 'r-annule',
    statut: 'ملغى',
    annuleLe: '01/08/2026 17:40',
    versements: [
      unVersement({ montantCentimes: 800000, nature: 'نقد' }),
      unVersement({ id: 'v2', rang: 2, montantCentimes: 200000, nature: 'شيك' }),
    ],
  })

  it('retient les reçus annulés selon leur date d’annulation', () => {
    const trouves = annulationsDeLaPeriode([annule], { filtre: 'day', jour: '2026-08-01' }, MAINTENANT)
    expect(trouves).toHaveLength(1)
  })

  it('exclut un reçu annulé un autre jour', () => {
    const trouves = annulationsDeLaPeriode([annule], { filtre: 'day', jour: '2026-07-31' }, MAINTENANT)
    expect(trouves).toHaveLength(0)
  })

  it('ignore les reçus non annulés', () => {
    expect(annulationsDeLaPeriode([unRecu()], { filtre: 'all' }, MAINTENANT)).toHaveLength(0)
  })

  it('totalise le montant annulé tous modes confondus', () => {
    // Observation O-06 : ici le fichier emploie le total payé, pas le remboursé.
    expect(totalAnnuleCentimes([annule])).toBe(1000000)
  })
})

describe('R-63, R-64, R-65 — anomalies', () => {
  const impression = (numero: number, ids: string[]): ImpressionFinance => ({
    id: `fp-${numero}`,
    jour: '2026-08-01',
    imprimeLe: `01/08/2026 1${numero}:00`,
    employe: 'x',
    numeroImpression: numero,
    mouvementIds: ids,
    nombreLignes: ids.length,
  })

  it('R-64 — aucune anomalie tant que le jour n’a pas été imprimé', () => {
    expect(anomaliesCandidates([], ['a', 'b'])).toEqual([])
  })

  it('signale un mouvement apparu après la dernière impression', () => {
    expect(anomaliesCandidates([impression(1, ['a'])], ['a', 'b'])).toEqual(['b'])
  })

  it('signale un mouvement apparu entre deux impressions', () => {
    const candidats = anomaliesCandidates(
      [impression(1, ['a']), impression(2, ['a', 'b'])],
      ['a', 'b'],
    )
    expect(candidats).toEqual(['b'])
  })

  it('ne signale rien si rien n’a changé', () => {
    expect(anomaliesCandidates([impression(1, ['a', 'b'])], ['a', 'b'])).toEqual([])
  })

  it('R-65 — retire les anomalies déjà acquittées', () => {
    const restantes = anomaliesEnAttente(['a', 'b'], {
      jour: '2026-08-01',
      mouvementIds: ['a'],
      acquitteLe: '01/08/2026 18:00',
      acquittePar: 'المدير',
    })
    expect(restantes).toEqual(['b'])
  })

  it('conserve toutes les anomalies sans acquittement', () => {
    expect(anomaliesEnAttente(['a', 'b'], null)).toEqual(['a', 'b'])
  })
})

describe('R-61 — droit d’imprimer', () => {
  const base = { aujourdhui: '2026-08-01', hier: '2026-07-31' }

  it('autorise l’employé sur la journée courante et la veille', () => {
    expect(peutImprimer({ ...base, jour: '2026-08-01', estAdministrateur: false })).toBe(true)
    expect(peutImprimer({ ...base, jour: '2026-07-31', estAdministrateur: false })).toBe(true)
  })

  it('refuse l’employé au-delà', () => {
    expect(peutImprimer({ ...base, jour: '2026-07-30', estAdministrateur: false })).toBe(false)
  })

  it('n’impose aucune limite à l’administrateur', () => {
    expect(peutImprimer({ ...base, jour: '2020-01-01', estAdministrateur: true })).toBe(true)
  })

  it('refuse une période qui n’est pas une journée unique', () => {
    expect(peutImprimer({ ...base, jour: null, estAdministrateur: true })).toBe(false)
  })
})

describe('R-62, R-66, R-67 — impression et état', () => {
  it('numérote l’impression sur deux chiffres', () => {
    expect(codeImpression(1)).toBe('01')
    expect(codeImpression(0)).toBe('')
  })

  it('marque les impressions multiples', () => {
    expect(codeImpression(3)).toBe('⧉ 03')
  })

  it('R-66 — signale une veille porteuse d’anomalies', () => {
    expect(etatVeille([])).toBe('✓')
    expect(etatVeille(['a'])).toBe('?')
  })

  it('R-67 — compte trente et une lignes par page', () => {
    expect(LIGNES_PAR_PAGE_IMPRIMEE).toBe(31)
    expect(nombreDePages(0)).toBe(1)
    expect(nombreDePages(31)).toBe(1)
    expect(nombreDePages(32)).toBe(2)
    expect(nombreDePages(62)).toBe(2)
  })

  it('choisit le symbole d’état selon la situation', () => {
    expect(etatImpression({ anomalieEnAttente: true, estAujourdhui: true }).symbole).toBe('?')
    expect(etatImpression({ anomalieEnAttente: false, estAujourdhui: true }).symbole).toBe('✓')
    expect(etatImpression({ anomalieEnAttente: false, estAujourdhui: false }).symbole).toBe('●')
  })
})

describe('R-62, R-67 — bandeau et cadres de l’impression', () => {
  it('R-62 — le bandeau porte toujours deux chiffres, même sans impression', () => {
    expect(codeImpressionBandeau(0)).toBe('01')
    expect(codeImpressionBandeau(1)).toBe('01')
    expect(codeImpressionBandeau(12)).toBe('12')
  })

  it('R-67 — retire le cadre des seuls codes visés par le fichier', () => {
    // Sans cadre : versements suivants, méthode « E », point d’état.
    expect(badgeSansCadreALImpression('versement', '2')).toBe(true)
    expect(badgeSansCadreALImpression('mode', 'E')).toBe(true)
    expect(badgeSansCadreALImpression('statut', '\u2022')).toBe(true)
  })

  it('R-67 — conserve le cadre des autres codes', () => {
    expect(badgeSansCadreALImpression('versement', 'N')).toBe(false)
    expect(badgeSansCadreALImpression('mode', 'CH')).toBe(false)
    expect(badgeSansCadreALImpression('mode', 'V-P')).toBe(false)
    expect(badgeSansCadreALImpression('mode', 'CH-P')).toBe(false)
    expect(badgeSansCadreALImpression('statut', '\u2713')).toBe(false)
  })
})
