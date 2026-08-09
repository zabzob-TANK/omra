import { describe, expect, it } from 'vitest'

import {
  chiffresTelephone,
  echapperHtml,
  formaterDate,
  formaterMontant,
  formaterTelephone,
  nettoyerArabe,
  telephoneCorrespondRecherche,
  telephoneNormalise,
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

describe('téléphone — normalisation partagée création/modification', () => {
  it('accepte le format déjà mis en forme par la frappe', () => {
    expect(telephoneNormalise('0613-36.05.92')).toBe('0613360592')
  })

  it('accepte les chiffres bruts, sans aucun séparateur', () => {
    expect(telephoneNormalise('0613360592')).toBe('0613360592')
  })

  it('accepte des espaces à la place des séparateurs habituels', () => {
    expect(telephoneNormalise('0612 34 56 78')).toBe('0612345678')
  })

  it('tolère les espaces de bord et les parenthèses', () => {
    expect(telephoneNormalise('  (0612) 34.56.78  ')).toBe('0612345678')
  })

  it('ajoute le préfixe 0 automatique aux 9 chiffres saisis normalement', () => {
    // Règle définitive du 2026-08-09 : l'employé tape les 9 chiffres qui
    // suivent le 0, jamais le 0 lui-même.
    expect(telephoneNormalise('661234567')).toBe('0661234567')
  })

  it('ne double jamais le préfixe sur un numéro déjà à dix chiffres', () => {
    expect(telephoneNormalise('0661234567')).toBe('0661234567')
  })

  it('refuse neuf chiffres commençant déjà par 0 — ni complété ni corrigé', () => {
    // 066123456 pourrait être une saisie tronquée : jamais deviné en
    // silence, refusé comme n'importe quelle longueur invalide.
    expect(telephoneNormalise('066123456')).toBeNull()
  })

  it('refuse dix chiffres ne commençant pas par 0', () => {
    expect(telephoneNormalise('6612345678')).toBeNull()
  })

  it('refuse une lettre au lieu de la retirer en silence', () => {
    // Une saisie fautive ne doit jamais devenir un numéro valide sans que
    // personne ne s'en aperçoive — même avec dix caractères par ailleurs.
    expect(telephoneNormalise('061234567a')).toBeNull()
    expect(telephoneNormalise('06a1234567')).toBeNull()
  })

  it('refuse un compte de chiffres qui ne correspond ni à neuf ni à dix', () => {
    expect(telephoneNormalise('06123456')).toBeNull() // 8
    expect(telephoneNormalise('06123456789')).toBeNull() // 11
    expect(telephoneNormalise('')).toBeNull()
  })

  it('ne traite pas le format international pour l’instant — refusé comme toute autre saisie invalide', () => {
    expect(telephoneNormalise('+212612345678')).toBeNull()
    expect(telephoneNormalise('00212612345678')).toBeNull()
  })

  it('les deux mêmes numéros sous des habillages différents se normalisent identiquement', () => {
    const variantes = ['0613360592', '0613-36.05.92', '0613 36 05 92', '(0613) 36.05.92']
    const normalises = new Set(variantes.map(telephoneNormalise))
    expect(normalises.size).toBe(1)
    expect(normalises.has('0613360592')).toBe(true)
  })
})

describe('téléphone — recherche du registre (numéro complet ou 6 derniers chiffres)', () => {
  const stocke = '0613-36.05.92' // tel qu'affiché, formaterTelephone(phone_snapshot)

  it('trouve par le numéro brut', () => {
    expect(telephoneCorrespondRecherche(stocke, '0613360592')).toBe(true)
  })

  it('trouve par le numéro mis en forme, avec ou sans les mêmes séparateurs', () => {
    expect(telephoneCorrespondRecherche(stocke, '0613-36.05.92')).toBe(true)
    expect(telephoneCorrespondRecherche(stocke, '0613 36 05 92')).toBe(true)
  })

  it('trouve par les 6 derniers chiffres seulement', () => {
    expect(telephoneCorrespondRecherche(stocke, '360592')).toBe(true)
  })

  it('ne trouve pas avec moins de 6 chiffres — trop de faux positifs à l’échelle prévue', () => {
    expect(telephoneCorrespondRecherche(stocke, '0592')).toBe(false)
  })

  it('ne trouve pas un autre numéro, y compris un suffixe qui ne correspond pas', () => {
    expect(telephoneCorrespondRecherche(stocke, '999999')).toBe(false)
    expect(telephoneCorrespondRecherche(stocke, '0699887766')).toBe(false)
  })

  it('une requête avec des lettres n’est pas une recherche téléphone — jamais une correspondance approximative', () => {
    expect(telephoneCorrespondRecherche(stocke, 'abc592')).toBe(false)
  })

  it('reste sûre sur un numéro stocké encore dans l’ancien format, avant migration', () => {
    // `telephoneCorrespondRecherche` ne dépend d'aucune hypothèse de format
    // sur la valeur stockée : elle en extrait les chiffres, point final.
    expect(telephoneCorrespondRecherche('0613360592', '360592')).toBe(true)
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
