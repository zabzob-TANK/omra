import { describe, expect, it } from 'vitest'

import { annulationConservelesDonnees, preparerAnnulation, type SaisieAnnulation } from './cancellation'
import { unRecu, unVersement } from './fixtures'

const CONTEXTE = {
  employe: 'المدير',
  horodatage: '01/08/2026 17:40',
  date: '01/08/2026',
  heure: '17:40',
  jour: '2026-08-01',
  idMouvement: 'mvt-1',
  identiteVerifiee: true,
}

function saisie(partiel: Partial<SaisieAnnulation> = {}): SaisieAnnulation {
  return {
    motif: 'إلغاء السفر',
    modeRemboursement: 'cash',
    motDePasse: 'xxxx',
    ...partiel,
  }
}

const recu = unRecu({
  convenuCentimes: 2600000,
  versements: [
    unVersement({ id: 'a', montantCentimes: 800000 }),
    unVersement({ id: 'b', rang: 2, montantCentimes: 200000, nature: 'شيك' }),
  ],
})

function codes(s: SaisieAnnulation, contexte = CONTEXTE) {
  const resultat = preparerAnnulation(s, recu, contexte)
  return resultat.statut === 'erreurs' ? resultat.erreurs.map((e) => e.code) : []
}

describe('P05 — un reçu déjà annulé ne peut pas être annulé une seconde fois', () => {
  it('refuse si le reçu est déjà annulé', () => {
    const recuAnnule = unRecu({
      statut: 'ملغى',
      convenuCentimes: 2600000,
      versements: [unVersement({ montantCentimes: 800000 })],
    })
    const resultat = preparerAnnulation(saisie(), recuAnnule, CONTEXTE)
    expect(resultat.statut).toBe('erreurs')
    if (resultat.statut === 'erreurs') {
      expect(resultat.erreurs[0].code).toBe('recu-annule')
    }
  })
})

describe('R-43 — champs obligatoires', () => {
  it('exige le motif, le mode de remboursement et le mot de passe', () => {
    expect(codes(saisie({ motif: '', modeRemboursement: '', motDePasse: '' }))).toEqual([
      'motif-annulation-obligatoire',
      'mode-remboursement-obligatoire',
      'mot-de-passe-obligatoire',
    ])
  })

  it('refuse un motif composé uniquement d’espaces', () => {
    expect(codes(saisie({ motif: '   ' }))).toContain('motif-annulation-obligatoire')
  })
})

describe('R-44 — vérification d’identité', () => {
  it('refuse une identité non vérifiée', () => {
    expect(codes(saisie(), { ...CONTEXTE, identiteVerifiee: false })).toEqual([
      'mot-de-passe-incorrect',
    ])
  })

  it('n’intervient qu’après les champs obligatoires', () => {
    const resultat = codes(saisie({ motif: '' }), { ...CONTEXTE, identiteVerifiee: false })
    expect(resultat).toEqual(['motif-annulation-obligatoire'])
  })
})

describe('R-45 — aucune suppression', () => {
  it('conserve numéro, versements et total payé', () => {
    const apres = { ...recu, statut: 'ملغى' as const }
    expect(annulationConservelesDonnees(recu, apres)).toBe(true)
  })

  it('détecte une perte de versements', () => {
    const ampute = { ...recu, statut: 'ملغى' as const, versements: [] }
    expect(annulationConservelesDonnees(recu, ampute)).toBe(false)
  })
})

describe('R-46 — montant remboursé, plafonné au convenu (§5.10, §5.11)', () => {
  it('vaut le total payé, tous modes de paiement confondus, quand il ne dépasse pas le convenu', () => {
    const resultat = preparerAnnulation(saisie(), recu, CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.donnees.montantRembourseCentimes).toBe(
      1000000,
    )
  })

  it('vaut zéro pour un reçu sans versement', () => {
    const vide = unRecu({ versements: [] })
    const resultat = preparerAnnulation(saisie(), vide, CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.donnees.montantRembourseCentimes).toBe(0)
  })

  it('plafonne au convenu en cas de trop-perçu : le surplus reste en caisse', () => {
    // Reprend l'exemple de référence du document de reprise : convenu à
    // 20 000 DH, 22 000 DH encaissés — remboursement de 20 000 DH, jamais 22 000.
    const tropPercu = unRecu({
      convenuCentimes: 2000000,
      versements: [
        unVersement({ id: 'a', montantCentimes: 1200000 }),
        unVersement({ id: 'b', rang: 2, montantCentimes: 1000000, nature: 'شيك' }),
      ],
    })
    const resultat = preparerAnnulation(saisie(), tropPercu, CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.donnees.montantRembourseCentimes).toBe(
      2000000,
    )
  })
})

describe('R-47 — mouvement de caisse', () => {
  it('crée un mouvement pour un remboursement en espèces', () => {
    const resultat = preparerAnnulation(saisie({ modeRemboursement: 'cash' }), recu, CONTEXTE)
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return

    const mouvement = resultat.valeur.mouvementCaisse
    expect(mouvement).not.toBeNull()
    expect(mouvement!.type).toBe('refund_cash')
    expect(mouvement!.montantCentimes).toBe(1000000)
    expect(mouvement!.recuNumero).toBe(recu.numero)
    expect(mouvement!.jour).toBe('2026-08-01')
  })

  it('ne crée aucun mouvement pour un remboursement hors caisse', () => {
    const resultat = preparerAnnulation(saisie({ modeRemboursement: 'none' }), recu, CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.mouvementCaisse).toBeNull()
  })

  it('sort de la caisse le total payé, même si une partie a été réglée par chèque', () => {
    // 8 000 DH en espèces et 2 000 DH par chèque : la sortie porte sur 10 000 DH.
    const resultat = preparerAnnulation(saisie({ modeRemboursement: 'cash' }), recu, CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.mouvementCaisse!.montantCentimes).toBe(
      1000000,
    )
  })

  it('la sortie de caisse est plafonnée au convenu, pas au total payé, en cas de trop-perçu', () => {
    const tropPercu = unRecu({
      convenuCentimes: 2000000,
      versements: [unVersement({ montantCentimes: 2200000 })],
    })
    const resultat = preparerAnnulation(saisie({ modeRemboursement: 'cash' }), tropPercu, CONTEXTE)
    expect(resultat.statut === 'ok' && resultat.valeur.mouvementCaisse!.montantCentimes).toBe(
      2000000,
    )
  })
})

describe('données d’annulation', () => {
  it('consigne l’auteur, l’horodatage et le mode', () => {
    const resultat = preparerAnnulation(saisie(), recu, CONTEXTE)
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return

    expect(resultat.valeur.donnees.annulePar).toBe('المدير')
    expect(resultat.valeur.donnees.annuleLe).toBe('01/08/2026 17:40')
    expect(resultat.valeur.donnees.modeRemboursement).toBe('cash')
    expect(resultat.valeur.donnees.motif).toBe('إلغاء السفر')
  })
})
