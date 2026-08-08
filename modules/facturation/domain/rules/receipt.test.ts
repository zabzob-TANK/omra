import { describe, expect, it } from 'vitest'

import { unRecu, unVersement } from './fixtures'
import { dernierVersement, restantDu, statutAffiche, symboleSituation, totalPaye } from './receipt'

describe('U-05 — total payé et restant dû', () => {
  it('additionne tous les versements', () => {
    const recu = unRecu({
      versements: [
        unVersement({ id: 'a', montantCentimes: 1000000 }),
        unVersement({ id: 'b', montantCentimes: 600000 }),
      ],
    })
    expect(totalPaye(recu)).toBe(1600000)
  })

  it('calcule le restant comme convenu moins payé', () => {
    const recu = unRecu({
      convenuCentimes: 2600000,
      versements: [unVersement({ montantCentimes: 1000000 })],
    })
    expect(restantDu(recu)).toBe(1600000)
  })

  it('vaut zéro sans versement', () => {
    expect(totalPaye(unRecu({ versements: [] }))).toBe(0)
  })

  it('inclut les versements d’un reçu annulé — ils ne disparaissent pas', () => {
    const recu = unRecu({ statut: 'ملغى', versements: [unVersement({ montantCentimes: 800000 })] })
    expect(totalPaye(recu)).toBe(800000)
  })

  it('n’écrête pas un restant négatif — comportement de la référence conservé', () => {
    const recu = unRecu({
      convenuCentimes: 1000000,
      versements: [unVersement({ montantCentimes: 1200000 })],
    })
    expect(restantDu(recu)).toBe(-200000)
  })
})

describe('U-06 — statut affiché', () => {
  it('affiche « soldé » quand le restant est nul', () => {
    const recu = unRecu({
      convenuCentimes: 1000000,
      versements: [unVersement({ montantCentimes: 1000000 })],
    })
    expect(statutAffiche(recu)).toBe('مسدد')
  })

  it('affiche « soldé », même en trop-perçu (restant négatif) — décision du 2026-08-08', () => {
    // reprise.md §5.11 à la lettre : un restant ≤ 0 vaut « soldé », trop-perçu
    // compris. La visibilité du trop-perçu ne repose plus sur ce statut —
    // voir `Recu.anomalies` (traduit de `active_anomalies`, testé plus bas
    // dans mappers.test.ts), affiché indépendamment et en rouge.
    const recu = unRecu({
      convenuCentimes: 1000000,
      versements: [unVersement({ montantCentimes: 1200000 })],
    })
    expect(statutAffiche(recu)).toBe('مسدد')
  })

  it('affiche « incomplet » quand il reste à payer', () => {
    expect(statutAffiche(unRecu())).toBe('غير مكتمل')
  })

  it('donne la priorité à l’annulation, même sur un reçu soldé', () => {
    const recu = unRecu({
      statut: 'ملغى',
      convenuCentimes: 1000000,
      versements: [unVersement({ montantCentimes: 1000000 })],
    })
    expect(statutAffiche(recu)).toBe('ملغى')
  })
})

describe('dernier versement et symbole de situation', () => {
  it('renvoie le versement le plus récent', () => {
    const recu = unRecu({
      versements: [unVersement({ id: 'a' }), unVersement({ id: 'b', rang: 2 })],
    })
    expect(dernierVersement(recu)?.id).toBe('b')
  })

  it('renvoie null sans versement', () => {
    expect(dernierVersement(unRecu({ versements: [] }))).toBeNull()
  })

  it('marque un solde par ✓ et un reste par •', () => {
    expect(symboleSituation(0)).toBe('✓')
    expect(symboleSituation(1)).toBe('•')
  })

  it('marque ✓, même en trop-perçu (restant négatif) — même règle que statutAffiche', () => {
    expect(symboleSituation(-200000)).toBe('✓')
  })
})
