import { describe, expect, it } from 'vitest'

import {
  CARACTERES_NON_ARABES,
  CHAMBRES_DEMO,
  HOTELS_DEMO,
  MAX_VERSEMENTS,
  RABATTEURS_DEMO,
  ROLE_ADMINISTRATEUR,
  ROLE_CAISSE,
  SAISON_DEMO,
  TARIFS_DEMO,
  VOLS_DEMO,
} from './constants'

describe('C-01 — hôtels', () => {
  it('reprend les trois hôtels du fichier de référence', () => {
    expect(HOTELS_DEMO).toEqual(['منار الشروق', 'رايا مبارك', 'واحة احياد'])
  })
})

describe('C-02 — compagnies aériennes', () => {
  it('reprend les deux compagnies du fichier de référence', () => {
    expect(VOLS_DEMO).toEqual(['الخطوط السعودية', 'القطرية'])
  })
})

describe('C-03 — types de chambre', () => {
  it('va de deux à sept', () => {
    expect(CHAMBRES_DEMO).toEqual(['2', '3', '4', '5', '6', '7'])
  })
})

describe('C-04 — rabatteurs', () => {
  it('reprend les cinq rabatteurs du fichier de référence', () => {
    expect(RABATTEURS_DEMO).toHaveLength(5)
    expect(RABATTEURS_DEMO[0]).toBe('zemzem')
  })
})

describe('C-05 — grille tarifaire', () => {
  it('est indexée par hôtel et vol, puis par chambre', () => {
    expect(TARIFS_DEMO['منار الشروق|الخطوط السعودية']['2']).toBe(34800)
  })

  it('O-08 — ne couvre que quatre des six combinaisons, comportement conservé', () => {
    expect(Object.keys(TARIFS_DEMO)).toHaveLength(4)
    expect(TARIFS_DEMO['رايا مبارك|القطرية']).toBeUndefined()
  })

  it('ne définit pas toutes les chambres pour toutes les combinaisons', () => {
    // « رايا مبارك » ne propose pas de chambre 6 ni 7 : R-05 doit bloquer.
    expect(TARIFS_DEMO['رايا مبارك|الخطوط السعودية']['6']).toBeUndefined()
  })
})

describe('C-06 — saison', () => {
  it('porte un plafond de réduction de 300 000 centimes, soit 3 000 DH', () => {
    expect(SAISON_DEMO.reductionMaxCentimes).toBe(300000)
  })

  it('porte un nom et une durée affichés tels quels', () => {
    expect(SAISON_DEMO.nom).toBe('عمرة رمضان 2027')
    expect(SAISON_DEMO.duree).toBe('60 يوم')
  })
})

describe('C-07 — maximum de versements', () => {
  it('vaut six', () => {
    // Règle explicite et bloquante du fichier de référence (R-18, R-20),
    // et non une déduction tirée des six lignes du reçu imprimé.
    expect(MAX_VERSEMENTS).toBe(6)
  })
})

describe('C-08 — comptes et rôles', () => {
  it('expose les rôles, qui portent des règles métier', () => {
    expect(ROLE_ADMINISTRATEUR).toBe('مدير')
    expect(ROLE_CAISSE).toBe('صندوق')
  })

  it('O-03 — ne contient aucun identifiant ni mot de passe', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./constants.ts', import.meta.url), 'utf8'),
    )
    // Les comptes en clair du prototype (`3/3`, `samir/1234`) ne sont pas reproduits.
    expect(source).not.toMatch(/samir/i)
    expect(source).not.toMatch(/\bpwd\b/)
    expect(source).not.toMatch(/1234/)
  })
})

describe('C-09 — filtre de saisie des caractères arabes', () => {
  it('laisse passer les caractères arabes et les espaces', () => {
    expect('سعيدة شقير'.replace(CARACTERES_NON_ARABES, '')).toBe('سعيدة شقير')
  })

  it('retire les caractères latins, les chiffres et la ponctuation', () => {
    expect('abc123!'.replace(CARACTERES_NON_ARABES, '')).toBe('')
  })
})
