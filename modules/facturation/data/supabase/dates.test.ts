import { describe, expect, it } from 'vitest'
import { dateSqlVersDateFr, isoVersDateFr, isoVersHeure, isoVersHorodatage } from './dates'

describe('isoVersDateFr', () => {
  it('convertit un timestamptz UTC en date française dans le fuseau Africa/Casablanca', () => {
    // Casablanca est en UTC+1 depuis 2018 (heure permanente, pas de passage hiver/été).
    expect(isoVersDateFr('2026-08-01T10:23:45.000Z')).toBe('01/08/2026')
  })

  it('fait basculer le jour quand le décalage de fuseau change la date locale', () => {
    // 23:30 UTC = 00:30 à Casablanca (UTC+1) le lendemain.
    expect(isoVersDateFr('2026-08-01T23:30:00.000Z')).toBe('02/08/2026')
  })

  it('lève une erreur sur un horodatage invalide', () => {
    expect(() => isoVersDateFr('pas-une-date')).toThrow()
  })
})

describe('isoVersHeure', () => {
  it('formate en HH:MM sur 24 heures dans le fuseau Africa/Casablanca', () => {
    expect(isoVersHeure('2026-08-01T10:23:45.000Z')).toBe('11:23')
  })

  it('conserve le zéro initial', () => {
    expect(isoVersHeure('2026-08-01T07:05:00.000Z')).toBe('08:05')
  })
})

describe('isoVersHorodatage', () => {
  it('combine la date et l’heure françaises', () => {
    expect(isoVersHorodatage('2026-08-01T10:23:45.000Z')).toBe('01/08/2026 11:23')
  })
})

describe('dateSqlVersDateFr', () => {
  it('convertit une colonne date aaaa-mm-jj en jj/mm/aaaa', () => {
    expect(dateSqlVersDateFr('2026-08-01')).toBe('01/08/2026')
  })

  it('accepte un timestamp complet et ignore la partie horaire', () => {
    expect(dateSqlVersDateFr('2026-08-01T00:00:00.000Z')).toBe('01/08/2026')
  })

  it('lève une erreur sur une date invalide', () => {
    expect(() => dateSqlVersDateFr('01-08-2026')).toThrow()
  })
})
