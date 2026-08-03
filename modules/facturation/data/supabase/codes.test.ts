import { describe, expect, it } from 'vitest'
import { NATURE_CHEQUE, NATURE_ESPECES, NATURE_VIREMENT } from '../../domain/constants'
import {
  lifecycleDepuisStatut,
  modePaiementDepuisNature,
  modeRemboursementDepuisRoute,
  natureDepuisModePaiement,
  routeDepuisModeRemboursement,
  statutDepuisLifecycle,
} from './codes'

describe('natureDepuisModePaiement / modePaiementDepuisNature', () => {
  it('traduit les trois modes de paiement dans les deux sens', () => {
    expect(natureDepuisModePaiement('cash')).toBe(NATURE_ESPECES)
    expect(natureDepuisModePaiement('cheque')).toBe(NATURE_CHEQUE)
    expect(natureDepuisModePaiement('transfer')).toBe(NATURE_VIREMENT)

    expect(modePaiementDepuisNature(NATURE_ESPECES)).toBe('cash')
    expect(modePaiementDepuisNature(NATURE_CHEQUE)).toBe('cheque')
    expect(modePaiementDepuisNature(NATURE_VIREMENT)).toBe('transfer')
  })

  it('ne stocke ni ne renvoie jamais un code inconnu tel quel', () => {
    expect(() => natureDepuisModePaiement('virement')).toThrow()
    expect(() => natureDepuisModePaiement('CASH')).toThrow()
    expect(() => modePaiementDepuisNature('نقدا' as never)).toThrow()
  })

  it('fait un aller-retour fidèle pour chaque mode', () => {
    for (const mode of ['cash', 'cheque', 'transfer'] as const) {
      expect(modePaiementDepuisNature(natureDepuisModePaiement(mode))).toBe(mode)
    }
  })
})

describe('statutDepuisLifecycle / lifecycleDepuisStatut', () => {
  it('traduit les deux statuts dans les deux sens', () => {
    expect(statutDepuisLifecycle('active')).toBe('نشط')
    expect(statutDepuisLifecycle('cancelled')).toBe('ملغى')
    expect(lifecycleDepuisStatut('نشط')).toBe('active')
    expect(lifecycleDepuisStatut('ملغى')).toBe('cancelled')
  })

  it('ne tolère aucun statut inconnu', () => {
    expect(() => statutDepuisLifecycle('archived')).toThrow()
    expect(() => lifecycleDepuisStatut('en_attente' as never)).toThrow()
  })
})

describe('modeRemboursementDepuisRoute / routeDepuisModeRemboursement', () => {
  it('traduit les deux routes de restitution dans les deux sens', () => {
    expect(modeRemboursementDepuisRoute('cash_register')).toBe('cash')
    expect(modeRemboursementDepuisRoute('outside_register')).toBe('none')
    expect(routeDepuisModeRemboursement('cash')).toBe('cash_register')
    expect(routeDepuisModeRemboursement('none')).toBe('outside_register')
  })

  it('ne tolère aucune route inconnue', () => {
    expect(() => modeRemboursementDepuisRoute('partial')).toThrow()
  })
})
