import { describe, expect, it } from 'vitest'

import {
  centimesEnDirhamsSaisis,
  centimesEnTexte,
  centimesEnTexteDevise,
  dirhamsSaisisEnCentimes,
  sansMarquesIsolat,
} from './money'

describe('U-01 — formatage d’un montant en centimes', () => {
  it('divise par cent et groupe les milliers à la française', () => {
    expect(centimesEnTexte(3480000)).toBe('34 800')
  })

  it('normalise l’espace fine insécable en espace simple', () => {
    // `toLocaleString('fr-FR')` produit U+202F ; le prototype le remplace.
    expect(centimesEnTexte(3480000)).not.toMatch(/\u202f|\u00a0/)
    expect(centimesEnTexte(3480000).charCodeAt(2)).toBe(32)
  })

  it('conserve la virgule décimale quand le montant n’est pas rond', () => {
    expect(centimesEnTexte(34850)).toBe('348,5')
  })

  it('formate zéro sans séparateur', () => {
    expect(centimesEnTexte(0)).toBe('0')
  })
})

describe('U-02 — montant avec devise, isolé en lecture gauche-à-droite', () => {
  it('encadre la valeur des marques d’isolat U+2066 et U+2069', () => {
    const texte = centimesEnTexteDevise(3480000)
    expect(texte.codePointAt(0)).toBe(0x2066)
    expect(texte.codePointAt(texte.length - 1)).toBe(0x2069)
  })

  it('ajoute la devise après le montant', () => {
    expect(sansMarquesIsolat(centimesEnTexteDevise(3480000))).toBe('34 800 DH')
  })

  it('reste lisible pour un montant nul', () => {
    expect(sansMarquesIsolat(centimesEnTexteDevise(0))).toBe('0 DH')
  })
})

describe('conversions de saisie', () => {
  it('convertit des dirhams saisis en centimes', () => {
    expect(dirhamsSaisisEnCentimes('34800')).toBe(3480000)
  })

  it('ramène une saisie vide ou invalide à zéro', () => {
    expect(dirhamsSaisisEnCentimes('')).toBe(0)
    expect(dirhamsSaisisEnCentimes('abc')).toBe(0)
  })

  it('ramène une saisie négative à zéro', () => {
    expect(dirhamsSaisisEnCentimes('-500')).toBe(0)
  })

  it('reconvertit des centimes en dirhams pour un champ de saisie', () => {
    expect(centimesEnDirhamsSaisis(3480000)).toBe('34800')
  })
})
