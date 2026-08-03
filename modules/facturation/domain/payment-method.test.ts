import { describe, expect, it } from 'vitest'

import { NATURE_CHEQUE, NATURE_ESPECES, NATURE_VIREMENT } from './constants'
import {
  codeCouleurNature,
  estInstrumentBancaire,
  identiteOperationPartagee,
  instrumentEnArabe,
  instrumentEnFrancais,
  natureAbregee,
  natureNormalisee,
} from './payment-method'

describe('U-12 — normalisation de la nature de paiement', () => {
  it('reconnaît les espèces sous toutes leurs graphies', () => {
    expect(natureNormalisee('cash')).toBe(NATURE_ESPECES)
    expect(natureNormalisee('Espèces')).toBe(NATURE_ESPECES)
    expect(natureNormalisee('نقد')).toBe(NATURE_ESPECES)
  })

  it('reconnaît le chèque sous toutes ses graphies', () => {
    expect(natureNormalisee('cheque')).toBe(NATURE_CHEQUE)
    expect(natureNormalisee('Chèque')).toBe(NATURE_CHEQUE)
    expect(natureNormalisee('شيك')).toBe(NATURE_CHEQUE)
  })

  it('reconnaît le virement sous toutes ses graphies', () => {
    expect(natureNormalisee('transfer')).toBe(NATURE_VIREMENT)
    expect(natureNormalisee('Virement')).toBe(NATURE_VIREMENT)
    expect(natureNormalisee('تحويل بنكي')).toBe(NATURE_VIREMENT)
  })

  it('renvoie la valeur telle quelle si elle n’est pas reconnue — comportement conservé', () => {
    expect(natureNormalisee('troc')).toBe('troc')
    expect(natureNormalisee('')).toBe('')
    expect(natureNormalisee(null)).toBe('')
  })

  it('abrège le virement dans les tableaux', () => {
    expect(natureAbregee('تحويل بنكي')).toBe('تحويل')
    expect(natureAbregee('نقد')).toBe(NATURE_ESPECES)
  })

  it('associe un code couleur à chaque nature', () => {
    expect(codeCouleurNature('نقد')).toBe('cash')
    expect(codeCouleurNature('شيك')).toBe('cheque')
    expect(codeCouleurNature('تحويل بنكي')).toBe('transfer')
    expect(codeCouleurNature('troc')).toBe('none')
  })

  it('distingue les instruments bancaires des espèces', () => {
    expect(estInstrumentBancaire('شيك')).toBe(true)
    expect(estInstrumentBancaire('تحويل بنكي')).toBe(true)
    expect(estInstrumentBancaire('نقد')).toBe(false)
  })

  it('fournit les libellés français et arabes de l’instrument', () => {
    expect(instrumentEnFrancais('تحويل بنكي')).toBe('Virement')
    expect(instrumentEnFrancais('شيك')).toBe('Chèque')
    expect(instrumentEnArabe('تحويل بنكي')).toBe('التحويل')
    expect(instrumentEnArabe('شيك')).toBe('الشيك')
  })
})

describe('U-13 — identité dérivée d’une opération partagée', () => {
  it('assemble banque, numéro et date', () => {
    expect(identiteOperationPartagee('4471182', '02/07/2025', 'البنك الشعبي')).toBe(
      'shared|البنك الشعبي|4471182|02/07/2025',
    )
  })

  it('normalise la casse et les espaces multiples', () => {
    const a = identiteOperationPartagee('  ABC123 ', '02/07/2025', 'Banque   Populaire')
    const b = identiteOperationPartagee('abc123', '02/07/2025', 'banque populaire')
    expect(a).toBe(b)
  })

  it('tolère les valeurs absentes', () => {
    expect(identiteOperationPartagee(null, undefined, '')).toBe('shared|||')
  })

  it('O-04 — deux instruments distincts partageant banque, numéro et date sont fusionnés', () => {
    // Comportement du fichier de référence, documenté et conservé sans correction.
    const premier = identiteOperationPartagee('100', '02/07/2025', 'CIH')
    const second = identiteOperationPartagee('100', '02/07/2025', 'CIH')
    expect(premier).toBe(second)
  })
})
