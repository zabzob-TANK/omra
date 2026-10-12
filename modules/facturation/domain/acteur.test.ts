import { describe, expect, it } from 'vitest'

import { nomAffichageActeur } from './acteur'

describe('nomAffichageActeur — login plutôt que « Employé N » (2026-10-12)', () => {
  it('affiche « admin » pour le slot 1, quel que soit son login', () => {
    expect(nomAffichageActeur(1, 'direction', 'Administrateur')).toBe('admin')
  })

  it('affiche le login d’un employé', () => {
    expect(nomAffichageActeur(2, 'simo', 'Employé 1')).toBe('simo')
    expect(nomAffichageActeur(3, '  iman ', 'Employé 2')).toBe('iman')
  })

  it('garde le libellé quand aucun login n’a été capturé', () => {
    expect(nomAffichageActeur(4, null, 'Employé 3')).toBe('Employé 3')
    expect(nomAffichageActeur(4, '  ', 'Employé 3')).toBe('Employé 3')
  })
})
