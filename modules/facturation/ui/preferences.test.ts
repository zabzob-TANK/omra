import { describe, expect, it } from 'vitest'

import {
  CLE_MODE_SOMBRE,
  DUREE_NOTIFICATION,
  creerStoreModeSombre,
  ecrireModeSombre,
  fermeLaFenetre,
  lireModeSombre,
  type StockagePreferences,
} from './preferences'

function stockageMemoire(initial: Record<string, string> = {}): StockagePreferences {
  const donnees = new Map(Object.entries(initial))
  return {
    getItem: (cle) => donnees.get(cle) ?? null,
    setItem: (cle, valeur) => {
      donnees.set(cle, valeur)
    },
  }
}

describe('R-87 — mode sombre conservé', () => {
  it('lit la préférence enregistrée', () => {
    expect(lireModeSombre(stockageMemoire({ [CLE_MODE_SOMBRE]: '1' }))).toBe(true)
    expect(lireModeSombre(stockageMemoire({ [CLE_MODE_SOMBRE]: '0' }))).toBe(false)
  })

  it('reste en mode clair sans préférence enregistrée', () => {
    expect(lireModeSombre(stockageMemoire())).toBe(false)
  })

  it('reste en mode clair si le stockage est indisponible', () => {
    expect(lireModeSombre(null)).toBe(false)
    expect(lireModeSombre(undefined)).toBe(false)
  })

  it('ne se laisse pas interrompre par un stockage en erreur', () => {
    const cassé: StockagePreferences = {
      getItem: () => {
        throw new Error('stockage refusé')
      },
      setItem: () => {
        throw new Error('stockage refusé')
      },
    }
    expect(lireModeSombre(cassé)).toBe(false)
    expect(() => ecrireModeSombre(cassé, true)).not.toThrow()
  })

  it('enregistre la préférence', () => {
    const stockage = stockageMemoire()
    ecrireModeSombre(stockage, true)
    expect(lireModeSombre(stockage)).toBe(true)
    ecrireModeSombre(stockage, false)
    expect(lireModeSombre(stockage)).toBe(false)
  })
})

describe('R-88 — notification transitoire', () => {
  it('dure 2 800 millisecondes, comme dans la référence', () => {
    expect(DUREE_NOTIFICATION).toBe(2800)
  })
})

describe('R-89 — fermeture par la touche d’échappement', () => {
  it('ferme sur Escape', () => {
    expect(fermeLaFenetre('Escape')).toBe(true)
  })

  it('ne ferme sur aucune autre touche', () => {
    expect(fermeLaFenetre('Enter')).toBe(false)
    expect(fermeLaFenetre('Esc')).toBe(false)
    expect(fermeLaFenetre(' ')).toBe(false)
  })
})

describe('R-87 — store externe du mode sombre', () => {
  it('sert le mode clair au rendu serveur', () => {
    const store = creerStoreModeSombre(stockageMemoire({ [CLE_MODE_SOMBRE]: '1' }))
    expect(store.lireServeur()).toBe(false)
    expect(store.lire()).toBe(true)
  })

  it('bascule et prévient les abonnés', () => {
    const store = creerStoreModeSombre(stockageMemoire())
    let appels = 0
    const desabonner = store.subscribe(() => {
      appels += 1
    })

    expect(store.lire()).toBe(false)
    store.basculer()
    expect(store.lire()).toBe(true)
    expect(appels).toBe(1)

    desabonner()
    store.basculer()
    expect(store.lire()).toBe(false)
    expect(appels).toBe(1)
  })

  it('persiste la bascule dans le stockage', () => {
    const stockage = stockageMemoire()
    const store = creerStoreModeSombre(stockage)
    store.basculer()
    expect(lireModeSombre(stockage)).toBe(true)
  })
})
