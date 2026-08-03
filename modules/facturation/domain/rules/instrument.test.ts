import { describe, expect, it } from 'vitest'

import type { ErreurValidation } from './errors'
import { CONTEXTE_PREPARATION, saisieCheque, saisieEspeces, unRecu, uneOperation, unVersement } from './fixtures'
import { preparerInstrument, validerInstrument } from './instrument'

function codes(saisie: Parameters<typeof validerInstrument>[0]): string[] {
  const liste: ErreurValidation[] = []
  validerInstrument(saisie, liste)
  return liste.map((e) => e.code)
}

describe('R-23 — espèces', () => {
  it('n’exige aucun champ d’instrument', () => {
    expect(codes(saisieEspeces())).toEqual([])
  })

  it('prépare un instrument sans référence, sans plafond', () => {
    const instrument = preparerInstrument(saisieEspeces(), CONTEXTE_PREPARATION)!
    expect(instrument.portee).toBe('unique')
    expect(instrument.reference).toBe('')
    expect(instrument.disponibleCentimes).toBe(Number.POSITIVE_INFINITY)
  })

  it('ignore les champs d’instrument éventuellement saisis', () => {
    const instrument = preparerInstrument(
      saisieEspeces({ reference: 'XYZ', banque: 'CIH' }),
      CONTEXTE_PREPARATION,
    )!
    expect(instrument.reference).toBe('')
    expect(instrument.banque).toBe('')
  })
})

describe('R-24 — opération partagée existante', () => {
  it('n’exige que l’identifiant de l’opération', () => {
    const saisie = saisieCheque({
      portee: 'shared',
      sourceOperation: 'existing',
      operationId: '',
      reference: '',
      dateInstrument: '',
      banque: '',
    })
    expect(codes(saisie)).toEqual(['operation-partagee-obligatoire'])
  })

  it('arrête la validation : les champs de l’instrument ne sont pas exigés', () => {
    const saisie = saisieCheque({
      portee: 'shared',
      sourceOperation: 'existing',
      operationId: 'SOP-1',
      reference: '',
      dateInstrument: '',
      banque: '',
      payeur: '',
      montantOperation: '',
    })
    expect(codes(saisie)).toEqual([])
  })
})

describe('R-25 — champs de l’instrument bancaire', () => {
  it('exige référence, date et banque', () => {
    const saisie = saisieCheque({ reference: '', dateInstrument: '', banque: '' })
    expect(codes(saisie)).toEqual([
      'reference-instrument-obligatoire',
      'date-instrument-obligatoire',
      'banque-obligatoire',
    ])
  })

  it('refuse une date au mauvais format', () => {
    expect(codes(saisieCheque({ dateInstrument: '2/7/2025' }))).toEqual([
      'date-instrument-invalide',
    ])
  })

  it('accepte un chèque complet', () => {
    expect(codes(saisieCheque())).toEqual([])
  })

  it('s’applique aussi au virement', () => {
    expect(codes(saisieCheque({ nature: 'تحويل بنكي', banque: '' }))).toEqual([
      'banque-obligatoire',
    ])
  })
})

describe('R-26 — nouvelle opération partagée', () => {
  const base = saisieCheque({ portee: 'shared', sourceOperation: 'new' })

  it('exige le payeur et le montant total', () => {
    expect(codes(base)).toEqual(['payeur-obligatoire', 'montant-operation-obligatoire'])
  })

  it('exige un montant total strictement positif', () => {
    const saisie = { ...base, payeur: 'عبد الله', montantOperation: '0' }
    expect(codes(saisie)).toEqual(['montant-operation-doit-etre-positif'])
  })

  it('accepte une opération complète', () => {
    const saisie = { ...base, payeur: 'عبد الله', montantOperation: '50000' }
    expect(codes(saisie)).toEqual([])
  })
})

describe('R-27 — rattachement à une opération existante', () => {
  const operation = uneOperation({ montantTotalCentimes: 5000000 })
  const recus = [
    unRecu({
      versements: [
        unVersement({
          montantCentimes: 2000000,
          portee: 'shared',
          operationPartageeId: operation.id,
        }),
      ],
    }),
  ]

  it('reprend les données de l’opération et son restant comme disponible', () => {
    const instrument = preparerInstrument(
      saisieCheque({ portee: 'shared', sourceOperation: 'existing', operationId: operation.id }),
      { ...CONTEXTE_PREPARATION, operations: [operation], recus },
    )!
    expect(instrument.reference).toBe(operation.reference)
    expect(instrument.banque).toBe(operation.banque)
    expect(instrument.payeur).toBe(operation.payeur)
    expect(instrument.operationPartageeId).toBe(operation.id)
    expect(instrument.nouvelleOperation).toBeNull()
    expect(instrument.disponibleCentimes).toBe(3000000)
  })

  it('renvoie null quand l’opération désignée n’existe pas', () => {
    const instrument = preparerInstrument(
      saisieCheque({ portee: 'shared', sourceOperation: 'existing', operationId: 'inconnue' }),
      { ...CONTEXTE_PREPARATION, operations: [operation], recus },
    )
    expect(instrument).toBeNull()
  })
})

describe('R-28 — création d’une opération partagée', () => {
  it('construit l’opération et prend son total comme disponible', () => {
    const instrument = preparerInstrument(
      saisieCheque({
        portee: 'shared',
        sourceOperation: 'new',
        payeur: 'عبد الله العثماني',
        montantOperation: '50000',
      }),
      CONTEXTE_PREPARATION,
    )!
    expect(instrument.nouvelleOperation).not.toBeNull()
    expect(instrument.nouvelleOperation!.id).toBe('SOP-NOUVELLE')
    expect(instrument.nouvelleOperation!.montantTotalCentimes).toBe(5000000)
    expect(instrument.nouvelleOperation!.statut).toBe('active')
    expect(instrument.nouvelleOperation!.image).toBeNull()
    expect(instrument.disponibleCentimes).toBe(5000000)
  })

  it('normalise la nature de l’opération créée', () => {
    const instrument = preparerInstrument(
      saisieCheque({
        nature: 'Virement',
        portee: 'shared',
        sourceOperation: 'new',
        payeur: 'x',
        montantOperation: '100',
      }),
      CONTEXTE_PREPARATION,
    )!
    expect(instrument.nouvelleOperation!.nature).toBe('تحويل بنكي')
  })
})
