import { describe, expect, it } from 'vitest'

import { unRecu, uneOperation, unVersement } from './fixtures'
import {
  depasseLeRestant,
  detecteLesDoublons,
  etatOperation,
  optionsOperations,
  totalAttribue,
} from './shared-payment'

const operation = uneOperation({ id: 'SOP-1', montantTotalCentimes: 5000000 })

function recuAvecPart(id: string, montant: number, operationId = 'SOP-1') {
  return unRecu({
    id,
    versements: [
      unVersement({ id: `v-${id}`, montantCentimes: montant, portee: 'shared', operationPartageeId: operationId }),
    ],
  })
}

describe('R-29 — total attribué à une opération', () => {
  it('additionne les parts de plusieurs reçus', () => {
    const recus = [recuAvecPart('a', 2500000), recuAvecPart('b', 1500000)]
    expect(totalAttribue(recus, 'SOP-1')).toBe(4000000)
  })

  it('ignore les versements rattachés à une autre opération', () => {
    const recus = [recuAvecPart('a', 2500000), recuAvecPart('b', 1500000, 'SOP-2')]
    expect(totalAttribue(recus, 'SOP-1')).toBe(2500000)
  })

  it('ignore les versements non partagés', () => {
    const recus = [recuAvecPart('a', 2500000), unRecu({ id: 'c' })]
    expect(totalAttribue(recus, 'SOP-1')).toBe(2500000)
  })

  it('inclut les parts d’un reçu annulé — elles restent rattachées', () => {
    const annule = { ...recuAvecPart('a', 2500000), statut: 'ملغى' as const }
    expect(totalAttribue([annule], 'SOP-1')).toBe(2500000)
  })
})

describe('R-30 — restant d’une opération', () => {
  it('vaut le total moins l’attribué', () => {
    const etat = etatOperation(operation, [recuAvecPart('a', 2000000)])
    expect(etat.totalCentimes).toBe(5000000)
    expect(etat.attribueCentimes).toBe(2000000)
    expect(etat.restantCentimes).toBe(3000000)
  })

  it('vaut le total complet quand rien n’est attribué', () => {
    expect(etatOperation(operation, []).restantCentimes).toBe(5000000)
  })

  it('devient négatif après un dépassement confirmé — l’écart est conservé', () => {
    const etat = etatOperation(operation, [recuAvecPart('a', 6000000)])
    expect(etat.restantCentimes).toBe(-1000000)
  })

  it('renvoie un état nul pour une opération absente', () => {
    expect(etatOperation(null, []).totalCentimes).toBe(0)
  })
})

describe('R-31 — opérations proposées', () => {
  const cheque = uneOperation({ id: 'CH-1', nature: 'شيك', creeeLe: '01/08/2026 09:00' })
  const virementRecent = uneOperation({ id: 'V-2', nature: 'تحويل بنكي', creeeLe: '01/08/2026 15:00' })
  const virementAncien = uneOperation({ id: 'V-1', nature: 'تحويل بنكي', creeeLe: '01/08/2026 08:00' })
  const archivee = uneOperation({ id: 'V-3', nature: 'تحويل بنكي', statut: 'archived' })
  const toutes = [cheque, virementRecent, virementAncien, archivee]

  it('ne propose que les opérations de même nature', () => {
    const options = optionsOperations(toutes, [], 'تحويل بنكي')
    expect(options.map((o) => o.id)).not.toContain('CH-1')
  })

  it('exclut les opérations archivées', () => {
    const options = optionsOperations(toutes, [], 'تحويل بنكي')
    expect(options.map((o) => o.id)).not.toContain('V-3')
  })

  it('trie par date de création décroissante', () => {
    const options = optionsOperations(toutes, [], 'تحويل بنكي')
    expect(options.map((o) => o.id)).toEqual(['V-2', 'V-1'])
  })

  it('exclut les opérations entièrement attribuées', () => {
    const recus = [recuAvecPart('a', 5000000, 'V-1')]
    const options = optionsOperations(toutes, recus, 'تحويل بنكي')
    expect(options.map((o) => o.id)).toEqual(['V-2'])
  })

  it('conserve l’opération déjà sélectionnée même sans restant', () => {
    const recus = [recuAvecPart('a', 5000000, 'V-1')]
    const options = optionsOperations(toutes, recus, 'تحويل بنكي', 'V-1')
    expect(options.map((o) => o.id)).toContain('V-1')
  })

  it('compose un libellé lisible en français', () => {
    const options = optionsOperations([virementRecent], [], 'تحويل بنكي')
    expect(options[0].libelle).toContain('Virement')
    expect(options[0].libelle).toContain('restant')
  })
})

describe('R-32 — dépassement du restant', () => {
  it('détecte un montant supérieur au disponible', () => {
    expect(depasseLeRestant(3000001, 3000000)).toBe(true)
  })

  it('accepte un montant égal au disponible sans confirmation', () => {
    expect(depasseLeRestant(3000000, 3000000)).toBe(false)
  })

  it('ne s’applique jamais à un instrument unique, dont le disponible est infini', () => {
    expect(depasseLeRestant(99999999, Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('R-33 — aucune surveillance automatique des doublons', () => {
  it('n’alerte jamais, conformément au fichier de référence', () => {
    expect(detecteLesDoublons()).toBe(false)
  })

  it('accepte deux opérations de caractéristiques identiques', () => {
    const a = uneOperation({ id: 'X-1' })
    const b = uneOperation({ id: 'X-2' })
    const options = optionsOperations([a, b], [], 'تحويل بنكي')
    expect(options).toHaveLength(2)
  })
})
