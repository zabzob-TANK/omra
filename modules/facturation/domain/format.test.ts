import { describe, expect, it } from 'vitest'

import {
  chiffresTelephone,
  echapperHtml,
  formaterDate,
  formaterMontant,
  formaterTelephone,
  nettoyerArabe,
} from './format'

describe('U-08 — masque du numéro de téléphone', () => {
  it('applique le masque complet', () => {
    expect(formaterTelephone('0611007500')).toBe('0611-00.75.00')
  })

  it('force le zéro initial', () => {
    expect(formaterTelephone('611007500')).toBe('0611-00.75.00')
  })

  it('retire les caractères non numériques', () => {
    expect(formaterTelephone('06 11 00 75 00')).toBe('0611-00.75.00')
  })

  it('tronque au-delà de dix chiffres', () => {
    expect(formaterTelephone('06110075009999')).toBe('0611-00.75.00')
  })

  it('construit le masque progressivement', () => {
    expect(formaterTelephone('06')).toBe('06')
    expect(formaterTelephone('0611')).toBe('0611')
    expect(formaterTelephone('061100')).toBe('0611-00')
    expect(formaterTelephone('06110075')).toBe('0611-00.75')
  })

  it('R-02 — compte les chiffres significatifs', () => {
    expect(chiffresTelephone('0611-00.75.00')).toBe(10)
    expect(chiffresTelephone('0611-00.75')).toBe(8)
  })
})

describe('U-09 — masque de date', () => {
  it('applique le masque complet', () => {
    expect(formaterDate('02072025')).toBe('02/07/2025')
  })

  it('construit le masque progressivement', () => {
    expect(formaterDate('0')).toBe('0')
    expect(formaterDate('02')).toBe('02')
    expect(formaterDate('0207')).toBe('02/07')
  })

  it('tronque au-delà de huit chiffres', () => {
    expect(formaterDate('020720259999')).toBe('02/07/2025')
  })

  it('ignore les séparateurs déjà saisis', () => {
    expect(formaterDate('02/07/2025')).toBe('02/07/2025')
  })
})

describe('U-10 — masque de montant', () => {
  it('ne conserve que les chiffres', () => {
    expect(formaterMontant('34 800 DH')).toBe('34800')
    expect(formaterMontant('12,50')).toBe('1250')
  })
})

describe('U-11 — nettoyage des champs arabes', () => {
  it('conserve les caractères arabes', () => {
    expect(nettoyerArabe('سعيدة')).toBe('سعيدة')
  })

  it('conserve les espaces', () => {
    expect(nettoyerArabe('سعيدة شقير')).toBe('سعيدة شقير')
  })

  it('retire les caractères latins et les chiffres', () => {
    expect(nettoyerArabe('سعيدة abc 123')).toBe('سعيدة  ')
  })
})

describe('U-14 — échappement HTML', () => {
  it('échappe les cinq caractères sensibles', () => {
    expect(echapperHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    )
  })

  it('rend la chaîne vide pour null et undefined', () => {
    expect(echapperHtml(null)).toBe('')
    expect(echapperHtml(undefined)).toBe('')
  })

  it('laisse le texte arabe intact', () => {
    expect(echapperHtml('منار الشروق')).toBe('منار الشروق')
  })
})
