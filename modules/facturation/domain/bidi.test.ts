import { describe, expect, it } from 'vitest'

import { attributsDirection, contientArabe } from './bidi'

describe('direction des valeurs', () => {
  it('rend les valeurs arabes de droite à gauche', () => {
    const { dir, style } = attributsDirection('arabe')
    expect(dir).toBe('rtl')
    expect(style.direction).toBe('rtl')
  })

  it('utilise plaintext pour les valeurs arabes, afin de tolérer un contenu latin', () => {
    expect(attributsDirection('arabe').style.unicodeBidi).toBe('plaintext')
  })

  it.each(['montant', 'date', 'telephone', 'reference'] as const)(
    'isole les valeurs de type %s de gauche à droite',
    (categorie) => {
      const { dir, style } = attributsDirection(categorie)
      expect(dir).toBe('ltr')
      expect(style.direction).toBe('ltr')
      expect(style.unicodeBidi).toBe('isolate')
    },
  )

  it('laisse le français en lecture gauche-à-droite', () => {
    expect(attributsDirection('francais').dir).toBe('ltr')
  })
})

describe('détection de contenu arabe', () => {
  it('reconnaît un texte arabe', () => {
    expect(contientArabe('منار الشروق')).toBe(true)
  })

  it('ne signale pas un texte latin', () => {
    expect(contientArabe('Manar Chourouk')).toBe(false)
  })

  it('ne signale pas un montant', () => {
    expect(contientArabe('34 800 DH')).toBe(false)
  })
})
