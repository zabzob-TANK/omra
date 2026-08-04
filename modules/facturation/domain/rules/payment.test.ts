import { describe, expect, it } from 'vitest'

import { MAX_VERSEMENTS } from '../constants'
import {
  CONTEXTE_PREPARATION,
  saisieCheque,
  saisieEspeces,
  unRecu,
  uneOperation,
  unVersement,
} from './fixtures'
import { motifRefusVersement, preparerVersement, type SaisieVersement } from './payment'

const CONTEXTE = {
  ...CONTEXTE_PREPARATION,
  idVersement: 'v-nouveau',
  date: '01/08/2026',
  heure: '12:00',
}

function saisie(partiel: Partial<SaisieVersement> = {}): SaisieVersement {
  return {
    numeroRecu: '262',
    montant: '5000',
    instrument: saisieEspeces(),
    ...partiel,
  }
}

/** Reçu de 26 000 DH avec `nombre` versements de 1 000 DH déjà enregistrés. */
function recuAvec(nombre: number) {
  return unRecu({
    convenuCentimes: 2600000,
    versements: Array.from({ length: nombre }, (_, i) =>
      unVersement({ id: `v-${i}`, rang: i + 1, montantCentimes: 100000 }),
    ),
  })
}

function codes(s: SaisieVersement, recu = recuAvec(1), contexte = CONTEXTE) {
  const resultat = preparerVersement(s, recu, contexte)
  return resultat.statut === 'erreurs' ? resultat.erreurs.map((e) => e.code) : []
}

describe('R-15 — numéro de reçu', () => {
  it('est obligatoire', () => {
    expect(codes(saisie({ numeroRecu: '' }))).toEqual(['numero-recu-obligatoire'])
  })

  it('doit correspondre à un reçu existant', () => {
    expect(codes(saisie(), null as never)).toEqual(['numero-recu-introuvable'])
  })
})

describe('R-16, R-17, R-18 — état du reçu', () => {
  it('refuse un reçu annulé', () => {
    const annule = unRecu({ statut: 'ملغى' })
    expect(codes(saisie(), annule)).toEqual(['recu-annule'])
  })

  it('refuse un reçu déjà soldé', () => {
    const solde = unRecu({
      convenuCentimes: 1000000,
      versements: [unVersement({ montantCentimes: 1000000 })],
    })
    expect(codes(saisie(), solde)).toEqual(['recu-deja-solde'])
  })

  it('un reçu en trop-perçu (restant négatif) n’est pas « déjà soldé » — R-21 refuse ensuite tout nouveau montant', () => {
    // Comparaison stricte à zéro, comme `rest(r)===0` du fichier de
    // référence : un trop-perçu (P13/§5.11) reste tentable ici, mais R-21
    // (montant > restant, ici négatif) le bloque avec un message qui montre
    // le vrai restant — plus informatif qu'un « déjà soldé » générique.
    const tropPercu = unRecu({
      convenuCentimes: 1000000,
      versements: [unVersement({ montantCentimes: 1200000 })],
    })
    expect(codes(saisie(), tropPercu)).toEqual(['montant-superieur-au-restant'])
  })

  it('refuse un septième versement', () => {
    expect(codes(saisie(), recuAvec(MAX_VERSEMENTS))).toEqual([
      'nombre-maximal-de-versements-atteint',
    ])
  })

  it('accepte encore un versement à cinq versements enregistrés', () => {
    expect(motifRefusVersement(recuAvec(5))).toBeNull()
  })

  it('expose le motif de refus avant toute tentative d’enregistrement', () => {
    expect(motifRefusVersement(recuAvec(MAX_VERSEMENTS))?.code).toBe(
      'nombre-maximal-de-versements-atteint',
    )
    expect(motifRefusVersement(null)?.code).toBe('numero-recu-introuvable')
  })
})

describe('R-19, R-21 — montant', () => {
  it('est obligatoire', () => {
    expect(codes(saisie({ montant: '' }))).toEqual(['montant-obligatoire'])
  })

  it('doit être strictement positif', () => {
    expect(codes(saisie({ montant: '0' }))).toEqual(['montant-doit-etre-positif'])
  })

  it('refuse un montant supérieur au restant', () => {
    // Restant : 26 000 − 1 000 = 25 000 DH.
    expect(codes(saisie({ montant: '25001' }))).toEqual(['montant-superieur-au-restant'])
  })

  it('accepte un montant égal au restant', () => {
    expect(codes(saisie({ montant: '25000' }))).toEqual([])
  })
})

describe('R-20 — le sixième versement doit solder exactement', () => {
  // Cinq versements de 1 000 DH : restant 21 000 DH, le prochain est le sixième.
  const cinqVersements = recuAvec(5)

  it('refuse un montant inférieur au restant', () => {
    expect(codes(saisie({ montant: '20000' }), cinqVersements)).toEqual([
      'sixieme-versement-doit-solder',
    ])
  })

  it('refuse un montant supérieur au restant', () => {
    expect(codes(saisie({ montant: '22000' }), cinqVersements)).toEqual([
      'sixieme-versement-doit-solder',
    ])
  })

  it('accepte le montant exact du restant', () => {
    expect(codes(saisie({ montant: '21000' }), cinqVersements)).toEqual([])
  })

  it('ne s’applique pas au cinquième versement', () => {
    expect(codes(saisie({ montant: '5000' }), recuAvec(4))).toEqual([])
  })

  it('rend tout reçu soldé après six versements', () => {
    const resultat = preparerVersement(saisie({ montant: '21000' }), cinqVersements, CONTEXTE)
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return
    expect(resultat.valeur.versement.instantane.restantApresCentimes).toBe(0)
    expect(resultat.valeur.versement.instantane.statutApres).toBe('✓')
  })
})

describe('R-22 — instantané du versement', () => {
  it('fige l’état du reçu au moment de l’enregistrement', () => {
    const resultat = preparerVersement(saisie({ montant: '5000' }), recuAvec(1), CONTEXTE)
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return

    const versement = resultat.valeur.versement
    expect(versement.rang).toBe(2)
    expect(versement.instantane.convenuCentimes).toBe(2600000)
    expect(versement.instantane.restantApresCentimes).toBe(2000000)
    expect(versement.instantane.statutApres).toBe('•')
  })

  it('donne au versement le rang suivant', () => {
    const resultat = preparerVersement(saisie({ montant: '1000' }), recuAvec(3), CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.versement.rang).toBe(4)
  })
})

describe('instrument et opération partagée', () => {
  it('cumule les erreurs du montant et de l’instrument', () => {
    const resultat = codes(
      saisie({ montant: '', instrument: saisieCheque({ reference: '', banque: '' }) }),
    )
    expect(resultat).toEqual([
      'montant-obligatoire',
      'reference-instrument-obligatoire',
      'banque-obligatoire',
    ])
  })

  it('demande confirmation lors d’un dépassement d’opération partagée', () => {
    const operation = uneOperation({ id: 'SOP-1', montantTotalCentimes: 200000 })
    const resultat = preparerVersement(
      saisie({
        montant: '5000',
        instrument: saisieCheque({
          nature: 'تحويل بنكي',
          portee: 'shared',
          sourceOperation: 'existing',
          operationId: 'SOP-1',
        }),
      }),
      recuAvec(1),
      { ...CONTEXTE, operations: [operation], recus: [] },
    )
    expect(resultat.statut).toBe('confirmation-requise')
  })

  it('crée l’opération partagée demandée', () => {
    const resultat = preparerVersement(
      saisie({
        montant: '5000',
        instrument: saisieCheque({
          portee: 'shared',
          sourceOperation: 'new',
          payeur: 'عبد الله',
          montantOperation: '10000',
        }),
      }),
      recuAvec(1),
      CONTEXTE,
    )
    expect(resultat.statut === 'ok' && resultat.valeur.nouvelleOperation?.id).toBe('SOP-NOUVELLE')
  })
})

describe('ordre des contrôles', () => {
  it('vérifie l’état du reçu avant le formulaire', () => {
    const annule = unRecu({ statut: 'ملغى' })
    expect(codes(saisie({ montant: '' }), annule)).toEqual(['recu-annule'])
  })

  it('vérifie le formulaire avant les montants', () => {
    expect(codes(saisie({ montant: '' }))).toEqual(['montant-obligatoire'])
  })
})
