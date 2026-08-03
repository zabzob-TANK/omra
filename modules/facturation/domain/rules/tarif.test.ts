import { describe, expect, it } from 'vitest'

import { TARIFS_TEST } from './fixtures'
import {
  construireGrille,
  montantConvenu,
  reductionAtteintLeTarif,
  reductionDepasseLePlafond,
} from './tarif'

describe('R-05 — tarif d’une combinaison', () => {
  const grille = construireGrille(TARIFS_TEST)

  it('renvoie le tarif d’une combinaison définie', () => {
    expect(grille.tarifPour('منار الشروق', 'الخطوط السعودية', '4')).toBe(2600000)
  })

  it('renvoie null pour une chambre non tarifée — la création doit être bloquée', () => {
    expect(grille.tarifPour('منار الشروق', 'الخطوط السعودية', '7')).toBeNull()
  })

  it('renvoie null pour une combinaison hôtel × vol absente', () => {
    expect(grille.tarifPour('رايا مبارك', 'القطرية', '2')).toBeNull()
  })

  it('renvoie null si un critère est vide', () => {
    expect(grille.tarifPour('', 'الخطوط السعودية', '4')).toBeNull()
    expect(grille.tarifPour('منار الشروق', '', '4')).toBeNull()
    expect(grille.tarifPour('منار الشروق', 'الخطوط السعودية', '')).toBeNull()
  })

  it('traite un tarif à zéro comme absent, comme la référence', () => {
    const avecZero = construireGrille([
      { saisonId: 's1', hotelId: 'h', volId: 'v', chambreId: '2', montantCentimes: 0 },
    ])
    expect(avecZero.tarifPour('h', 'v', '2')).toBeNull()
  })
})

describe('R-06 — plafond de réduction de la saison', () => {
  it('accepte une réduction égale au plafond', () => {
    expect(reductionDepasseLePlafond(300000, 300000)).toBe(false)
  })

  it('refuse une réduction au-dessus du plafond', () => {
    expect(reductionDepasseLePlafond(300100, 300000)).toBe(true)
  })
})

describe('R-07 — réduction strictement inférieure au tarif', () => {
  it('refuse une réduction égale au tarif', () => {
    expect(reductionAtteintLeTarif(2600000, 2600000)).toBe(true)
  })

  it('refuse une réduction supérieure au tarif', () => {
    expect(reductionAtteintLeTarif(2700000, 2600000)).toBe(true)
  })

  it('accepte une réduction inférieure', () => {
    expect(reductionAtteintLeTarif(100000, 2600000)).toBe(false)
  })
})

describe('R-08 — montant convenu', () => {
  it('vaut tarif moins réduction', () => {
    expect(montantConvenu(2600000, 100000)).toBe(2500000)
  })

  it('vaut le tarif sans réduction', () => {
    expect(montantConvenu(2600000, 0)).toBe(2600000)
  })
})
