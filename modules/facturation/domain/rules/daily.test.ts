import { describe, expect, it } from 'vitest'

import type { ImpressionFinance, MouvementCaisse } from '../types'
import { unRecu, uneOperation, unVersement } from './fixtures'
import {
  basculerSelection,
  basculerToutesVisibles,
  dernierJourAffiche,
  etatControle,
  journeesVisibles,
  joursDuMois,
  moisValide,
  NOMS_JOURS,
  perimetreDeCalcul,
  resumeJournee,
  resumesDuMois,
  selectionApresMasquage,
  selectionDuMois,
  totalJournee,
  totauxJournees,
  type ResumeJournee,
  type SourceJournees,
} from './daily'

/** 5 août 2026, un mercredi. */
const MAINTENANT = new Date(2026, 7, 5, 12, 0, 0)

function source(partiel: Partial<SourceJournees> = {}): SourceJournees {
  return {
    recus: [],
    operations: [],
    mouvementsCaisse: [],
    impressions: [],
    anomaliesEnAttente: () => 0,
    ...partiel,
  }
}

describe('R-68 — une ligne par jour du mois', () => {
  it('s’arrête au jour courant pour le mois en cours', () => {
    expect(dernierJourAffiche('2026-08', MAINTENANT)).toBe(5)
    const cles = joursDuMois('2026-08', MAINTENANT)
    expect(cles).toHaveLength(5)
    // Du plus récent au plus ancien, comme dans le fichier.
    expect(cles[0]).toBe('2026-08-05')
    expect(cles.at(-1)).toBe('2026-08-01')
  })

  it('couvre le mois entier pour un mois passé', () => {
    expect(dernierJourAffiche('2026-07', MAINTENANT)).toBe(31)
    expect(joursDuMois('2026-07', MAINTENANT)).toHaveLength(31)
  })

  it('retombe sur le mois courant si le mois demandé est invalide', () => {
    expect(moisValide('', MAINTENANT)).toBe('2026-08')
    expect(moisValide('2026-13-01', MAINTENANT)).toBe('2026-08')
    expect(moisValide('2026-03', MAINTENANT)).toBe('2026-03')
  })

  it('conserve les journées sans activité', () => {
    const resumes = resumesDuMois('2026-08', MAINTENANT, source())
    expect(resumes).toHaveLength(5)
    expect(resumes.every((r) => !r.active)).toBe(true)
  })
})

describe('R-69 — définition d’une journée active', () => {
  const jour = '2026-08-03'

  it('un versement suffit', () => {
    const recu = unRecu({
      date: '03/08/2026',
      versements: [unVersement({ date: '03/08/2026' })],
    })
    expect(resumeJournee(jour, source({ recus: [recu] })).active).toBe(true)
  })

  it('un mouvement de caisse seul suffit', () => {
    const mouvement: MouvementCaisse = {
      id: 'm-1',
      type: 'refund_cash',
      jour,
      date: '03/08/2026',
      heure: '17:00',
      montantCentimes: 500000,
      recuNumero: 262,
      client: 'سعيدة شقير',
      employe: 'سمير بنعلي',
    }
    expect(resumeJournee(jour, source({ mouvementsCaisse: [mouvement] })).active).toBe(true)
  })

  it('une impression seule suffit', () => {
    const impression: ImpressionFinance = {
      id: 'p-1',
      jour,
      imprimeLe: '03/08/2026 18:00',
      employe: 'سمير بنعلي',
      numeroImpression: 1,
      mouvementIds: [],
      nombreLignes: 0,
    }
    expect(resumeJournee(jour, source({ impressions: [impression] })).active).toBe(true)
  })

  it('une journée sans aucune trace reste inactive', () => {
    expect(resumeJournee(jour, source()).active).toBe(false)
  })
})

describe('R-72 — agrégats d’une journée', () => {
  const jour = '2026-08-03'

  it('les espèces sont nettes des remboursements de caisse', () => {
    const recu = unRecu({
      date: '03/08/2026',
      versements: [unVersement({ date: '03/08/2026', montantCentimes: 1000000 })],
    })
    const mouvement: MouvementCaisse = {
      id: 'm-1',
      type: 'refund_cash',
      jour,
      date: '03/08/2026',
      heure: '17:00',
      montantCentimes: 300000,
      recuNumero: 999,
      client: 'x',
      employe: 'y',
    }
    const resume = resumeJournee(jour, source({ recus: [recu], mouvementsCaisse: [mouvement] }))
    expect(resume.especesCentimes).toBe(700000)
  })

  it('R-34 — une opération partagée ne compte qu’une fois, à son montant déclaré', () => {
    const operation = uneOperation({
      id: 'SOP-9',
      creeeLe: '03/08/2026 14:00',
      montantTotalCentimes: 5000000,
    })
    const part = (id: string, recuId: string) =>
      unRecu({
        id: recuId,
        date: '03/08/2026',
        versements: [
          unVersement({
            id,
            date: '03/08/2026',
            nature: 'تحويل بنكي',
            montantCentimes: 2500000,
            portee: 'shared',
            operationPartageeId: operation.id,
            montantOperationCentimes: operation.montantTotalCentimes,
          }),
        ],
      })
    const resume = resumeJournee(
      jour,
      source({ recus: [part('v-a', 'r-a'), part('v-b', 'r-b')], operations: [operation] }),
    )
    expect(resume.nombreVirements).toBe(1)
    expect(resume.virementsCentimes).toBe(5000000)
  })

  it('rattache une opération partagée à sa journée de création', () => {
    // L'opération est créée le 3, le versement est daté du 4 : le fichier
    // retient la journée de création de l'opération.
    const operation = uneOperation({ id: 'SOP-8', creeeLe: '03/08/2026 14:00' })
    const recu = unRecu({
      date: '04/08/2026',
      versements: [
        unVersement({
          date: '04/08/2026',
          nature: 'تحويل بنكي',
          montantCentimes: 2500000,
          portee: 'shared',
          operationPartageeId: operation.id,
          montantOperationCentimes: 5000000,
        }),
      ],
    })
    const contexte = source({ recus: [recu], operations: [operation] })
    expect(resumeJournee('2026-08-03', contexte).nombreVirements).toBe(1)
    expect(resumeJournee('2026-08-04', contexte).nombreVirements).toBe(0)
  })

  it('O-06 — l’annulation retient le remboursement s’il existe, le payé sinon', () => {
    const rembourse = unRecu({
      id: 'r-x',
      statut: 'ملغى',
      annuleLe: '03/08/2026 17:40',
      montantRembourseCentimes: 300000,
      versements: [unVersement({ montantCentimes: 800000 })],
    })
    const sansRemboursement = unRecu({
      id: 'r-y',
      statut: 'ملغى',
      annuleLe: '03/08/2026 18:00',
      montantRembourseCentimes: 0,
      versements: [unVersement({ id: 'v-2', montantCentimes: 900000 })],
    })
    const resume = resumeJournee(jour, source({ recus: [rembourse, sansRemboursement] }))
    expect(resume.nombreAnnulations).toBe(2)
    expect(resume.annulationsCentimes).toBe(300000 + 900000)
  })

  it('le total d’une journée additionne espèces nettes, chèques et virements', () => {
    const resume: ResumeJournee = {
      cle: jour,
      versements: 0,
      especesCentimes: 100,
      nombreCheques: 1,
      chequesCentimes: 200,
      nombreVirements: 1,
      virementsCentimes: 300,
      nouveauxClients: 0,
      nombreAnnulations: 0,
      annulationsCentimes: 0,
      modifications: 0,
      operations: 0,
      dernierRecu: null,
      active: true,
      imprimee: false,
      enAttente: 0,
    }
    expect(totalJournee(resume)).toBe(600)
    expect(totauxJournees([resume, resume]).totalCentimes).toBe(1200)
    expect(totauxJournees([resume]).bancaireCentimes).toBe(500)
    expect(totauxJournees([resume]).nombreOperationsBancaires).toBe(2)
  })
})

describe('R-72 — état de contrôle', () => {
  const base: ResumeJournee = {
    cle: '2026-08-03',
    versements: 3,
    especesCentimes: 0,
    nombreCheques: 0,
    chequesCentimes: 0,
    nombreVirements: 0,
    virementsCentimes: 0,
    nouveauxClients: 1,
    nombreAnnulations: 1,
    annulationsCentimes: 0,
    modifications: 2,
    operations: 4,
    dernierRecu: 266,
    active: true,
    imprimee: false,
    enAttente: 0,
  }

  it('journée sans opération', () => {
    const controle = etatControle({ ...base, active: false })
    expect(controle.etat).toBe('Aucune opération')
    expect(controle.classe).toBe('empty')
    expect(controle.prefixe).toBe('')
  })

  it('journée à imprimer, avec son préfixe de compteurs', () => {
    const controle = etatControle(base)
    expect(controle.etat).toBe('À imprimer')
    expect(controle.classe).toBe('pending')
    expect(controle.prefixe).toBe('R266 · Op4 · P3 · M2 ·')
  })

  it('journée imprimée', () => {
    expect(etatControle({ ...base, imprimee: true }).etat).toBe('Imprimée')
  })

  it('journée modifiée après impression', () => {
    const controle = etatControle({ ...base, imprimee: true, enAttente: 2 })
    expect(controle.etat).toBe('Modifiée après impression')
    expect(controle.classe).toBe('changed')
  })
})

describe('R-70 — sélection multiple et journées vides', () => {
  const active = (cle: string): ResumeJournee => ({
    cle,
    versements: 1,
    especesCentimes: 100,
    nombreCheques: 0,
    chequesCentimes: 0,
    nombreVirements: 0,
    virementsCentimes: 0,
    nouveauxClients: 0,
    nombreAnnulations: 0,
    annulationsCentimes: 0,
    modifications: 0,
    operations: 1,
    dernierRecu: null,
    active: true,
    imprimee: false,
    enAttente: 0,
  })
  const vide = (cle: string): ResumeJournee => ({
    ...active(cle),
    versements: 0,
    especesCentimes: 0,
    operations: 0,
    active: false,
  })

  it('bascule une journée', () => {
    expect(basculerSelection([], 'a')).toEqual(['a'])
    expect(basculerSelection(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('sélectionne puis désélectionne toutes les journées affichées', () => {
    const visibles = [active('a'), active('b')]
    const toutes = basculerToutesVisibles([], visibles)
    expect(new Set(toutes)).toEqual(new Set(['a', 'b']))
    expect(basculerToutesVisibles(toutes, visibles)).toEqual([])
  })

  it('masquer les journées vides retire de la sélection celles qui disparaissent', () => {
    const resumes = [active('a'), vide('b')]
    expect(journeesVisibles(resumes, false)).toHaveLength(1)
    expect(selectionApresMasquage(['a', 'b'], resumes)).toEqual(['a'])
  })

  it('la sélection ne retient que les journées du mois affiché', () => {
    expect([...selectionDuMois(['2026-08-01', '2026-07-30'], '2026-08')]).toEqual(['2026-08-01'])
  })

  it('le périmètre vaut le mois entier tant que rien n’est sélectionné', () => {
    const resumes = [active('a'), active('b')]
    expect(perimetreDeCalcul(resumes, new Set())).toHaveLength(2)
    expect(perimetreDeCalcul(resumes, new Set(['a']))).toHaveLength(1)
  })
})

describe('R-71 — samedi et dimanche', () => {
  it('nomme les jours en français, dimanche en tête', () => {
    expect(NOMS_JOURS[0]).toBe('Dimanche')
    expect(NOMS_JOURS[6]).toBe('Samedi')
    expect(NOMS_JOURS).toHaveLength(7)
  })
})
