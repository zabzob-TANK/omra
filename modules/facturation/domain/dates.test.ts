import { describe, expect, it } from 'vitest'

import {
  cleJour,
  cleJourDepuisDateFr,
  dateDuJour,
  dateFrDepuisCleJour,
  dateFrDepuisHorodatage,
  dateFrValide,
  decalerCleJour,
  estWeekEnd,
  heureCourante,
  heureDepuisHorodatage,
  horodatage,
} from './dates'

// 1er août 2026, 14 h 30 — un samedi.
const REFERENCE = new Date(2026, 7, 1, 14, 30, 5)

describe('U-03 — date et heure courantes', () => {
  it('produit une date française jj/mm/aaaa', () => {
    expect(dateDuJour(REFERENCE)).toBe('01/08/2026')
  })

  it('produit une heure HH:MM sans les secondes', () => {
    expect(heureCourante(REFERENCE)).toBe('14:30')
  })

  it('produit un horodatage complet', () => {
    expect(horodatage(REFERENCE)).toBe('01/08/2026 14:30')
  })
})

describe('U-04 — conversions entre date française et clé de journée', () => {
  it('construit la clé de journée d’une date', () => {
    expect(cleJour(REFERENCE)).toBe('2026-08-01')
  })

  it('convertit une date française en clé de journée', () => {
    expect(cleJourDepuisDateFr('01/08/2026')).toBe('2026-08-01')
  })

  it('renvoie une chaîne vide pour une date mal formée', () => {
    expect(cleJourDepuisDateFr('1/8/2026')).toBe('')
    expect(cleJourDepuisDateFr('')).toBe('')
    expect(cleJourDepuisDateFr(null)).toBe('')
  })

  it('convertit une clé de journée en date française', () => {
    expect(dateFrDepuisCleJour('2026-08-01')).toBe('01/08/2026')
  })

  it('renvoie le tiret cadratin pour une clé invalide, comme la référence', () => {
    expect(dateFrDepuisCleJour('2026-8-1')).toBe('—')
    expect(dateFrDepuisCleJour(undefined)).toBe('—')
  })
})

describe('U-07 — validation d’une date saisie', () => {
  it('accepte le format jj/mm/aaaa', () => {
    expect(dateFrValide('02/07/2025')).toBe(true)
  })

  it('refuse tout autre format', () => {
    expect(dateFrValide('2/7/2025')).toBe(false)
    expect(dateFrValide('02-07-2025')).toBe(false)
    expect(dateFrValide('')).toBe(false)
  })

  it('refuse un jour ou un mois qui n’existent pas — corrigé le 2026-08-06', () => {
    // Le fichier de référence acceptait cette date (contrôle de forme
    // uniquement) ; décision du commanditaire de durcir ce point après un
    // bug réel (une date comme celle-ci passait la validation, puis
    // échouait au moment d'enregistrer avec un message générique au lieu
    // d'un message clair sur le champ fautif).
    expect(dateFrValide('32/13/2025')).toBe(false)
    expect(dateFrValide('00/20/2026')).toBe(false)
    expect(dateFrValide('00/05/2025')).toBe(false)
  })

  it('refuse le 31 pour un mois de 30 jours, accepte les autres jours valides', () => {
    expect(dateFrValide('31/04/2025')).toBe(false)
    expect(dateFrValide('30/04/2025')).toBe(true)
  })

  it('gère février selon les années bissextiles', () => {
    expect(dateFrValide('29/02/2024')).toBe(true)
    expect(dateFrValide('29/02/2025')).toBe(false)
    expect(dateFrValide('28/02/2025')).toBe(true)
  })
})

describe('extraction depuis un horodatage', () => {
  it('isole la partie date', () => {
    expect(dateFrDepuisHorodatage('01/08/2026 17:40')).toBe('01/08/2026')
  })

  it('isole la partie heure quand elle est présente', () => {
    expect(heureDepuisHorodatage('01/08/2026 17:40')).toBe('17:40')
  })

  it('renvoie une chaîne vide quand l’heure est absente', () => {
    expect(heureDepuisHorodatage('01/08/2026')).toBe('')
  })
})

describe('navigation par journée', () => {
  it('décale une clé de journée vers l’arrière', () => {
    expect(decalerCleJour('2026-08-01', -1)).toBe('2026-07-31')
  })

  it('décale une clé de journée vers l’avant en changeant de mois', () => {
    expect(decalerCleJour('2026-07-31', 1)).toBe('2026-08-01')
  })

  it('R-71 — repère les samedis et dimanches', () => {
    expect(estWeekEnd('2026-08-01')).toBe(true) // samedi
    expect(estWeekEnd('2026-08-02')).toBe(true) // dimanche
    expect(estWeekEnd('2026-08-03')).toBe(false) // lundi
  })
})
