import { describe, expect, it } from 'vitest'

import {
  CHAMPS_NON_MODIFIABLES,
  consignerChangement,
  LIBELLES_SECTIONS,
  memeValeur,
  premierVersementModifiable,
  preparerModification,
  SECTIONS_MODIFIABLES,
  versementModifiable,
  type SaisieModification,
} from './edit-sections'
import { TARIFS_TEST, unRecu, unVersement } from './fixtures'
import type { ChangementChamp } from '../types'

const CONTEXTE = {
  tarifs: TARIFS_TEST,
  reductionMaxCentimes: 300000,
  estAdministrateur: false,
  nouvelIdOperation: () => 'SOP-test',
  horodatage: '03/08/2026 10:00',
  employe: 'موظف',
}

const recu = unRecu({
  convenuCentimes: 2600000,
  versements: [unVersement({ montantCentimes: 1000000 })],
})

function saisie(partiel: Partial<SaisieModification> = {}): SaisieModification {
  return {
    section: 'note',
    motif: 'correction',
    prenom: recu.prenom,
    nom: recu.nom,
    telephone: recu.telephone,
    hotel: recu.hotel,
    vol: recu.vol,
    chambre: recu.chambre,
    reduction: '0',
    groupeCoche: false,
    groupe: '',
    note: '',
    nature: 'نقد',
    reference: '',
    dateInstrument: '',
    banque: '',
    operationPartagee: false,
    payeur: '',
    montantOperation: '',
    montant: '',
    ...partiel,
  }
}

function codes(s: SaisieModification, cible = recu) {
  const resultat = preparerModification(s, cible, CONTEXTE)
  return resultat.statut === 'erreurs' ? resultat.erreurs.map((e) => e.code) : []
}

describe('P06 — un reçu annulé ne peut pas être modifié', () => {
  it('refuse la modification si le reçu est annulé', () => {
    const recuAnnule = unRecu({ statut: 'ملغى' })
    expect(codes(saisie(), recuAnnule)).toEqual(['recu-annule'])
  })
})

describe('R-49 — une seule section à la fois', () => {
  it('recense exactement six sections', () => {
    expect(SECTIONS_MODIFIABLES).toHaveLength(6)
    expect(SECTIONS_MODIFIABLES).toContain('identity')
    expect(SECTIONS_MODIFIABLES).toContain('firstPayment')
  })

  it('exige qu’une section soit choisie', () => {
    expect(codes(saisie({ section: '' }))).toEqual(['section-obligatoire'])
  })

  it('ne touche qu’aux champs de la section choisie', () => {
    const resultat = preparerModification(
      saisie({ section: 'note', note: 'nouvelle note', prenom: 'autre' }),
      recu,
      CONTEXTE,
    )
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return
    expect(Object.keys(resultat.valeur.champsModifies)).toEqual(['note'])
  })

  it('reprend les libellés de section du fichier de référence', () => {
    // Ces libellés sont enregistrés dans l'historique : ils ne sont pas traduits.
    expect(LIBELLES_SECTIONS.program).toBe('البرنامج والسعر')
    expect(LIBELLES_SECTIONS.firstPayment).toBe('طريقة الدفعة الأولى')
  })
})

describe('R-50 — motif obligatoire', () => {
  it('refuse une modification sans motif', () => {
    expect(codes(saisie({ motif: '' }))).toContain('motif-modification-obligatoire')
  })

  it('refuse un motif composé uniquement d’espaces', () => {
    expect(codes(saisie({ motif: '  ' }))).toContain('motif-modification-obligatoire')
  })
})

describe('R-51 — historique champ par champ', () => {
  it('ne consigne que les valeurs réellement changées', () => {
    const liste: ChangementChamp[] = []
    consignerChangement(liste, 'Note', 'a', 'a')
    consignerChangement(liste, 'Note', 'a', 'b')
    expect(liste).toHaveLength(1)
    expect(liste[0]).toEqual({ champ: 'Note', ancienne: 'a', nouvelle: 'b' })
  })

  it('traite null et undefined comme la chaîne vide', () => {
    expect(memeValeur(null, '')).toBe(true)
    expect(memeValeur(undefined, '')).toBe(true)
    expect(memeValeur(0, '0')).toBe(true)
  })

  it('consigne le changement de note', () => {
    const resultat = preparerModification(
      saisie({ section: 'note', note: 'à rappeler' }),
      recu,
      CONTEXTE,
    )
    expect(resultat.statut === 'ok' && resultat.valeur.changements).toEqual([
      { champ: 'الملاحظة', ancienne: '', nouvelle: 'à rappeler' },
    ])
  })
})

describe('R-52 — section programme', () => {
  it('exige hôtel, vol et chambre', () => {
    expect(codes(saisie({ section: 'program', hotel: '', vol: '', chambre: '' }))).toEqual(
      expect.arrayContaining(['hotel-obligatoire', 'vol-obligatoire', 'chambre-obligatoire']),
    )
  })

  it('bloque une combinaison sans tarif', () => {
    expect(codes(saisie({ section: 'program', chambre: '7' }))).toContain(
      'tarif-introuvable-combinaison',
    )
  })

  it('recalcule le tarif, la réduction et le convenu', () => {
    const resultat = preparerModification(
      saisie({ section: 'program', chambre: '2', reduction: '1000' }),
      recu,
      CONTEXTE,
    )
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return
    expect(resultat.valeur.champsModifies.tarifCentimes).toBe(3480000)
    expect(resultat.valeur.champsModifies.reductionCentimes).toBe(100000)
    expect(resultat.valeur.champsModifies.convenuCentimes).toBe(3380000)
  })

  it('applique le plafond de réduction de la saison', () => {
    expect(codes(saisie({ section: 'program', reduction: '3001' }))).toContain(
      'reduction-superieure-au-plafond',
    )
  })

  it('P13 — autorise un nouveau convenu inférieur au montant déjà payé (trop-perçu)', () => {
    // Reçu payé à hauteur de 30 000 DH ; passer à un convenu plus bas est
    // désormais autorisé (§5.11 : le trop-perçu n'est jamais un refus).
    const paye = unRecu({
      convenuCentimes: 3480000,
      chambre: '2',
      tarifCentimes: 3480000,
      versements: [unVersement({ montantCentimes: 3000000 })],
    })
    const resultat = preparerModification(
      saisie({ section: 'program', chambre: '4' }),
      paye,
      CONTEXTE,
    )
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return
    // Le nouveau convenu (chambre 4 : 26 000 DH) descend sous le payé (30 000 DH).
    expect(resultat.valeur.champsModifies.convenuCentimes).toBe(2600000)
  })
})

describe('R-53 — section premier versement', () => {
  it('ne touche pas au montant sans nouvelle valeur saisie', () => {
    const resultat = preparerModification(
      saisie({ section: 'firstPayment', nature: 'نقد' }),
      recu,
      CONTEXTE,
    )
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return
    const champs = resultat.valeur.changements.map((c) => c.champ)
    expect(champs).not.toContain('مبلغ الدفعة الأولى')
    expect(resultat.valeur.champsModifies).not.toHaveProperty('versements')
    expect(resultat.valeur.premierVersementCorrige?.versement.montantCentimes).toBe(
      recu.versements[0].montantCentimes,
    )
  })

  it('P01 — applique effectivement la correction d’instrument au versement', () => {
    const resultat = preparerModification(
      saisie({
        section: 'firstPayment',
        nature: 'شيك',
        reference: '998877',
        dateInstrument: '02/07/2026',
        banque: 'بنك الشعبي',
      }),
      recu,
      CONTEXTE,
    )
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return
    // Avant la correction, champsModifies ne pouvait exprimer aucun de ces
    // changements : c'est exactement le bogue P01. Ils vivent désormais dans
    // un champ dédié, porté ensuite par `corrigerPremierVersement`.
    expect(resultat.valeur.premierVersementCorrige?.versement).toMatchObject({
      nature: 'شيك',
      referenceInstrument: '998877',
      dateInstrument: '02/07/2026',
      banque: 'بنك الشعبي',
      portee: 'unique',
    })
  })

  it('P01, §5.9 — le montant du premier versement est réservé à l’administrateur', () => {
    expect(
      codes(saisie({ section: 'firstPayment', nature: 'نقد', montant: '500' })),
    ).toContain('montant-premier-versement-reserve-administrateur')
  })

  it('P01, §5.9 — l’administrateur peut corriger le montant', () => {
    const resultat = preparerModification(
      saisie({ section: 'firstPayment', nature: 'نقد', montant: '500' }),
      recu,
      { ...CONTEXTE, estAdministrateur: true },
    )
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return
    expect(resultat.valeur.premierVersementCorrige?.versement.montantCentimes).toBe(50000)
  })

  it('P01 — le passage unique vers partagé crée une nouvelle opération', () => {
    const resultat = preparerModification(
      saisie({
        section: 'firstPayment',
        nature: 'شيك',
        reference: '112233',
        dateInstrument: '02/07/2026',
        banque: 'بنك الشعبي',
        operationPartagee: true,
        payeur: 'محمد',
        montantOperation: '5000',
      }),
      recu,
      CONTEXTE,
    )
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return
    const { versement, nouvelleOperation } = resultat.valeur.premierVersementCorrige!
    expect(versement.portee).toBe('shared')
    expect(nouvelleOperation).not.toBeNull()
    expect(versement.operationPartageeId).toBe(nouvelleOperation?.id)
    expect(nouvelleOperation?.montantTotalCentimes).toBe(500000)
  })

  it('exige les champs de l’instrument pour un chèque', () => {
    expect(
      codes(saisie({ section: 'firstPayment', nature: 'شيك', reference: '', banque: '' })),
    ).toEqual(
      expect.arrayContaining([
        'reference-instrument-obligatoire',
        'date-instrument-obligatoire',
        'banque-obligatoire',
      ]),
    )
  })

  it('vide les champs d’instrument en repassant aux espèces', () => {
    const avecCheque = unRecu({
      versements: [
        unVersement({ nature: 'شيك', referenceInstrument: '4471182', banque: 'البنك الشعبي' }),
      ],
    })
    const resultat = preparerModification(
      saisie({ section: 'firstPayment', nature: 'نقد' }),
      avecCheque,
      CONTEXTE,
    )
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return
    const reference = resultat.valeur.changements.find((c) => c.champ === 'رقم الشيك / المرجع')
    expect(reference?.nouvelle).toBe('')
  })

  it('refuse la modification d’une opération partagée depuis le reçu', () => {
    const partage = unRecu({
      versements: [unVersement({ portee: 'shared', operationPartageeId: 'SOP-1' })],
    })
    expect(premierVersementModifiable(partage)).toBe(false)
    expect(premierVersementModifiable(recu)).toBe(true)
  })

  it('signale un reçu sans premier versement', () => {
    const vide = unRecu({ versements: [] })
    expect(codes(saisie({ section: 'firstPayment' }), vide)).toContain('premier-versement-absent')
  })
})

describe('R-54, R-55 — champs et versements non modifiables', () => {
  it('recense les champs verrouillés', () => {
    expect(CHAMPS_NON_MODIFIABLES).toContain('rabatteur')
    expect(CHAMPS_NON_MODIFIABLES).toContain('numero')
    expect(CHAMPS_NON_MODIFIABLES).toContain('montantPremierVersement')
  })

  it('n’autorise la modification que du premier versement', () => {
    expect(versementModifiable(1)).toBe(true)
    expect(versementModifiable(2)).toBe(false)
    expect(versementModifiable(6)).toBe(false)
  })

  it('ne place jamais le rabatteur parmi les champs modifiés', () => {
    const resultat = preparerModification(
      saisie({ section: 'program', chambre: '2' }),
      recu,
      CONTEXTE,
    )
    expect(resultat.statut === 'ok' && resultat.valeur.champsModifies).not.toHaveProperty(
      'rabatteur',
    )
  })
})

describe('sections identité, contact et groupe', () => {
  it('exige prénom et nom', () => {
    expect(codes(saisie({ section: 'identity', prenom: '', nom: '' }))).toEqual(
      expect.arrayContaining(['prenom-obligatoire', 'nom-obligatoire']),
    )
  })

  it('exige un téléphone de dix chiffres', () => {
    expect(codes(saisie({ section: 'contact', telephone: '0611' }))).toContain(
      'telephone-dix-chiffres',
    )
  })

  it('exige un code de groupe quand la case est cochée', () => {
    expect(codes(saisie({ section: 'group', groupeCoche: true, groupe: '' }))).toContain(
      'groupe-obligatoire',
    )
  })

  it('efface le groupe quand la case est décochée', () => {
    const avecGroupe = unRecu({ groupe: 'FAM-1' })
    const resultat = preparerModification(
      saisie({ section: 'group', groupeCoche: false }),
      avecGroupe,
      CONTEXTE,
    )
    expect(resultat.statut === 'ok' && resultat.valeur.champsModifies.groupe).toBe('')
  })
})
