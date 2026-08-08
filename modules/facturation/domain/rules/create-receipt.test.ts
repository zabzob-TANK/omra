import { describe, expect, it } from 'vitest'

import { preparerCreationRecu, VALEURS_INITIALES_RECU, type SaisieNouveauRecu } from './create-receipt'
import {
  CONTEXTE_PREPARATION,
  saisieCheque,
  saisieEspeces,
  TARIFS_TEST,
  unRecu,
  uneOperation,
  unVersement,
} from './fixtures'

const CONTEXTE = {
  ...CONTEXTE_PREPARATION,
  tarifs: TARIFS_TEST,
  reductionMaxCentimes: 300000,
  numero: 262,
  clientId: 'CLI-1',
  idVersement: 'v-nouveau',
  date: '01/08/2026',
  heure: '12:00',
}

function saisie(partiel: Partial<SaisieNouveauRecu> = {}): SaisieNouveauRecu {
  return {
    prenom: 'سعيدة',
    nom: 'شقير',
    telephone: '0611-00.75.00',
    hotel: 'منار الشروق',
    vol: 'الخطوط السعودية',
    chambre: '4',
    rabatteur: 'zemzem',
    reduction: '0',
    groupeCoche: false,
    groupe: '',
    premierVersement: '10000',
    note: '',
    instrument: saisieEspeces(),
    passeport: null,
    ...partiel,
  }
}

function codes(s: SaisieNouveauRecu, contexte = CONTEXTE) {
  const resultat = preparerCreationRecu(s, contexte)
  return resultat.statut === 'erreurs' ? resultat.erreurs.map((e) => e.code) : []
}

describe('R-01, R-02 — identité et contact', () => {
  it('exige le prénom et le nom', () => {
    expect(codes(saisie({ prenom: '', nom: '' }))).toEqual(
      expect.arrayContaining(['prenom-obligatoire', 'nom-obligatoire']),
    )
  })

  it('refuse un prénom composé uniquement d’espaces', () => {
    expect(codes(saisie({ prenom: '   ' }))).toContain('prenom-obligatoire')
  })

  it('exige le téléphone', () => {
    expect(codes(saisie({ telephone: '' }))).toContain('telephone-obligatoire')
  })

  it('exige exactement dix chiffres', () => {
    expect(codes(saisie({ telephone: '0611-00.75' }))).toContain('telephone-dix-chiffres')
  })

  it('refuse une lettre au lieu de la retirer en silence, même avec dix chiffres par ailleurs', () => {
    expect(codes(saisie({ telephone: '061100750a' }))).toContain('telephone-dix-chiffres')
  })

  it('stocke les 10 chiffres bruts, jamais la mise en forme de l’écran (R-02, cohérence avec la modification)', () => {
    const resultat = preparerCreationRecu(saisie({ telephone: '0611-00.75.00' }), CONTEXTE)
    expect(resultat.statut).toBe('ok')
    if (resultat.statut === 'ok') {
      expect(resultat.valeur.donnees.telephone).toBe('0611007500')
    }
  })
})

describe('R-03 — champs de programme obligatoires', () => {
  it('exige hôtel, vol, chambre, premier versement et intermédiaire', () => {
    const resultat = codes(
      saisie({ hotel: '', vol: '', chambre: '', premierVersement: '', rabatteur: '' }),
    )
    expect(resultat).toEqual(
      expect.arrayContaining([
        'hotel-obligatoire',
        'vol-obligatoire',
        'chambre-obligatoire',
        'premier-versement-obligatoire',
        'rabatteur-obligatoire',
      ]),
    )
  })

  it('produit les erreurs dans l’ordre du fichier de référence', () => {
    const resultat = codes(
      saisie({
        prenom: '',
        nom: '',
        telephone: '',
        hotel: '',
        vol: '',
        chambre: '',
        premierVersement: '',
        rabatteur: '',
      }),
    )
    expect(resultat).toEqual([
      'prenom-obligatoire',
      'nom-obligatoire',
      'telephone-obligatoire',
      'hotel-obligatoire',
      'vol-obligatoire',
      'chambre-obligatoire',
      'premier-versement-obligatoire',
      'rabatteur-obligatoire',
    ])
  })
})

describe('R-04 — code de groupe', () => {
  it('est obligatoire quand la case est cochée', () => {
    expect(codes(saisie({ groupeCoche: true, groupe: '' }))).toContain('groupe-obligatoire')
  })

  it('n’est pas exigé quand la case est décochée', () => {
    expect(codes(saisie({ groupeCoche: false, groupe: '' }))).toEqual([])
  })

  it('n’est conservé que si la case est cochée', () => {
    const resultat = preparerCreationRecu(saisie({ groupeCoche: false, groupe: 'FAM-1' }), CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.donnees.groupe).toBe('')
  })
})

describe('R-05 — combinaison sans tarif', () => {
  it('bloque la création', () => {
    expect(codes(saisie({ chambre: '7' }))).toEqual(['tarif-introuvable'])
  })
})

describe('R-06, R-07 — réduction', () => {
  it('refuse une réduction au-dessus du plafond de la saison', () => {
    expect(codes(saisie({ reduction: '3001' }))).toEqual(['reduction-superieure-au-plafond'])
  })

  it('accepte une réduction égale au plafond', () => {
    expect(codes(saisie({ reduction: '3000' }))).toEqual([])
  })

  it('refuse une réduction égale au tarif', () => {
    const contexte = { ...CONTEXTE, reductionMaxCentimes: 99999999 }
    expect(codes(saisie({ reduction: '26000' }), contexte)).toEqual([
      'reduction-superieure-ou-egale-au-tarif',
    ])
  })
})

describe('R-08 — montant convenu', () => {
  it('vaut tarif moins réduction', () => {
    const resultat = preparerCreationRecu(saisie({ reduction: '1000' }), CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.donnees.convenuCentimes).toBe(2500000)
  })
})

describe('R-09, R-10 — premier versement', () => {
  it('refuse un montant nul', () => {
    expect(codes(saisie({ premierVersement: '0' }))).toEqual(['montant-doit-etre-positif'])
  })

  it('refuse un surpaiement', () => {
    expect(codes(saisie({ premierVersement: '27000' }))).toEqual(['montant-superieur-au-convenu'])
  })

  it('accepte un versement égal au convenu, qui solde immédiatement', () => {
    const resultat = preparerCreationRecu(saisie({ premierVersement: '26000' }), CONTEXTE)
    expect(resultat.statut).toBe('ok')
    expect(
      resultat.statut === 'ok' && resultat.valeur.donnees.premierVersement.instantane.statutApres,
    ).toBe('✓')
  })
})

describe('R-11, R-12, R-13 — création', () => {
  it('reprend le numéro réservé', () => {
    const resultat = preparerCreationRecu(saisie(), CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.donnees.numero).toBe(262)
  })

  it('fixe les valeurs initiales : actif, zéro impression, aucune modification', () => {
    expect(VALEURS_INITIALES_RECU.statut).toBe('نشط')
    expect(VALEURS_INITIALES_RECU.impressions).toBe(0)
    expect(VALEURS_INITIALES_RECU.modifications).toHaveLength(0)
  })

  it('rattache le client et le passeport scanné', () => {
    const passeport = { numero: 'MA123' } as never
    const resultat = preparerCreationRecu(saisie({ passeport }), CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.donnees.clientId).toBe('CLI-1')
    expect(resultat.statut === 'ok' && resultat.valeur.donnees.passeport).toBe(passeport)
  })
})

describe('R-14 — instantané du premier versement', () => {
  it('fige client, programme, convenu, intermédiaire et restant', () => {
    const resultat = preparerCreationRecu(saisie({ premierVersement: '10000' }), CONTEXTE)
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return

    const instantane = resultat.valeur.donnees.premierVersement.instantane
    expect(instantane.client).toBe('سعيدة شقير')
    expect(instantane.hotel).toBe('منار الشروق')
    expect(instantane.chambre).toBe('4')
    expect(instantane.convenuCentimes).toBe(2600000)
    expect(instantane.rabatteur).toBe('zemzem')
    expect(instantane.restantApresCentimes).toBe(1600000)
    expect(instantane.statutApres).toBe('•')
  })

  it('donne le rang 1 au premier versement', () => {
    const resultat = preparerCreationRecu(saisie(), CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.donnees.premierVersement.rang).toBe(1)
  })
})

describe('R-32 — dépassement d’une opération partagée à la création', () => {
  const operation = uneOperation({ id: 'SOP-1', montantTotalCentimes: 3000000 })
  const recus = [
    unRecu({
      versements: [
        unVersement({ montantCentimes: 2500000, portee: 'shared', operationPartageeId: 'SOP-1' }),
      ],
    }),
  ]
  const contexte = { ...CONTEXTE, operations: [operation], recus }
  const avecOperation = saisie({
    premierVersement: '10000',
    instrument: saisieCheque({
      nature: 'تحويل بنكي',
      portee: 'shared',
      sourceOperation: 'existing',
      operationId: 'SOP-1',
    }),
  })

  it('demande une confirmation explicite au lieu de refuser', () => {
    const resultat = preparerCreationRecu(avecOperation, contexte)
    expect(resultat.statut).toBe('confirmation-requise')
    if (resultat.statut !== 'confirmation-requise') return
    expect(resultat.montantCentimes).toBe(1000000)
    expect(resultat.disponibleCentimes).toBe(500000)
  })

  it('enregistre après confirmation, en conservant l’écart', () => {
    const resultat = preparerCreationRecu(avecOperation, {
      ...contexte,
      depassementConfirme: true,
    })
    expect(resultat.statut).toBe('ok')
  })

  it('signale une opération partagée introuvable', () => {
    const resultat = preparerCreationRecu(
      saisie({
        instrument: saisieCheque({
          portee: 'shared',
          sourceOperation: 'existing',
          operationId: 'inconnue',
        }),
      }),
      contexte,
    )
    expect(resultat.statut === 'erreurs' && resultat.erreurs[0].code).toBe(
      'operation-partagee-introuvable',
    )
  })
})

describe('enchaînement des passes', () => {
  it('ne signale le tarif manquant qu’une fois les champs obligatoires remplis', () => {
    // Chambre non tarifée ET prénom vide : seule la première passe s'exprime.
    expect(codes(saisie({ prenom: '', chambre: '7' }))).toEqual(['prenom-obligatoire'])
  })

  it('n’expose qu’une seule erreur dans la seconde passe', () => {
    expect(codes(saisie({ reduction: '3001', premierVersement: '99999' }))).toHaveLength(1)
  })
})
