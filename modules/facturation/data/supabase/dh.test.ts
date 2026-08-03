import { describe, expect, it } from 'vitest'
import {
  centimesVersDh,
  centimesVersDhOuNull,
  dhVersCentimes,
  dhVersCentimesOuNull,
} from './dh'

describe('dhVersCentimes', () => {
  it('multiplie un entier par 100', () => {
    expect(dhVersCentimes(348)).toBe(34800)
    expect(dhVersCentimes(0)).toBe(0)
  })

  it('rejette une valeur non entière', () => {
    expect(() => dhVersCentimes(348.5)).toThrow()
  })

  it('rejette NaN, Infinity et les valeurs non numériques', () => {
    expect(() => dhVersCentimes(Number.NaN)).toThrow()
    expect(() => dhVersCentimes(Number.POSITIVE_INFINITY)).toThrow()
    expect(() => dhVersCentimes('348' as unknown as number)).toThrow()
  })
})

describe('dhVersCentimesOuNull', () => {
  it('propage null et undefined sans les convertir', () => {
    expect(dhVersCentimesOuNull(null)).toBeNull()
    expect(dhVersCentimesOuNull(undefined)).toBeNull()
  })

  it('convertit une valeur définie', () => {
    expect(dhVersCentimesOuNull(100)).toBe(10000)
  })
})

describe('centimesVersDh', () => {
  it('divise par 100 quand le montant tombe juste', () => {
    expect(centimesVersDh(34800)).toBe(348)
    expect(centimesVersDh(0)).toBe(0)
  })

  it('lève une erreur plutôt que d’arrondir un montant qui ne tombe pas juste', () => {
    expect(() => centimesVersDh(34850)).toThrow()
    expect(() => centimesVersDh(1)).toThrow()
    expect(() => centimesVersDh(99)).toThrow()
  })

  it('rejette une valeur non entière ou non numérique', () => {
    expect(() => centimesVersDh(Number.NaN)).toThrow()
    expect(() => centimesVersDh(100.5)).toThrow()
  })
})

describe('centimesVersDhOuNull', () => {
  it('propage null et undefined sans les convertir', () => {
    expect(centimesVersDhOuNull(null)).toBeNull()
    expect(centimesVersDhOuNull(undefined)).toBeNull()
  })

  it('convertit une valeur définie', () => {
    expect(centimesVersDhOuNull(10000)).toBe(100)
  })

  it('lève toujours une erreur sur un montant qui ne tombe pas juste', () => {
    expect(() => centimesVersDhOuNull(50)).toThrow()
  })
})

describe('aller-retour', () => {
  it('dh -> centimes -> dh restitue la valeur de départ pour tout entier', () => {
    for (const dh of [0, 1, 100, 348, 34800, 999999]) {
      expect(centimesVersDh(dhVersCentimes(dh))).toBe(dh)
    }
  })
})
