import { describe, expect, it } from 'vitest'

import { changementsHistorique } from './modification-history'

describe('changementsHistorique — reconstruction du détail à partir de before_data/after_data', () => {
  it('identité : prénom et nom, un seul champ touché reste seul dans la liste', () => {
    const changements = changementsHistorique(
      'billing_receipt.identity_updated',
      { prenom: 'نورة', nom: 'السوسي' },
      { prenom: 'منى', nom: 'السوسي' },
    )
    expect(changements).toEqual([{ champ: 'الاسم', ancienne: 'نورة', nouvelle: 'منى' }])
  })

  it('téléphone : formaté comme à la saisie en direct, pas les 10 chiffres bruts', () => {
    const changements = changementsHistorique(
      'billing_receipt.phone_updated',
      { telephone: '0611223344' },
      { telephone: '0699887766' },
    )
    expect(changements).toEqual([
      { champ: 'رقم الهاتف', ancienne: '0611-22.33.44', nouvelle: '0699-88.77.66' },
    ])
  })

  it('note : effacement (undefined/vide) affiché comme chaîne vide, jamais "undefined"', () => {
    const changements = changementsHistorique(
      'billing_receipt.note_updated',
      { note: 'à rappeler' },
      { note: undefined },
    )
    expect(changements).toEqual([{ champ: 'الملاحظة', ancienne: 'à rappeler', nouvelle: '' }])
  })

  it('programme/prix : hôtel, vol, chambre et les trois montants, dans cet ordre', () => {
    const changements = changementsHistorique(
      'billing_receipt.commercial_data_updated',
      { hotel: 'منار الشروق', vol: 'مدة طويلة', chambre: '2', tarifDh: 33800, reductionDh: 0, convenuDh: 33800 },
      { hotel: 'منار الشروق', vol: 'مدة طويلة', chambre: '2', tarifDh: 33800, reductionDh: 300, convenuDh: 33500 },
    )
    expect(changements.map((c) => c.champ)).toEqual(['التخفيض', 'المبلغ المتفق عليه'])
    expect(changements[0]).toEqual({ champ: 'التخفيض', ancienne: '⁦0 DH⁩', nouvelle: '⁦300 DH⁩' })
    expect(changements[1]).toEqual({ champ: 'المبلغ المتفق عليه', ancienne: '⁦33 800 DH⁩', nouvelle: '⁦33 500 DH⁩' })
  })

  it('versement — nouveau nom d\'action : montant et méthode, instrument omis pour les espèces', () => {
    const changements = changementsHistorique(
      'billing_receipt.payment_method_corrected',
      { montantDh: 5000, nature: 'cash' },
      { montantDh: 6000, nature: 'cash' },
    )
    expect(changements).toEqual([
      { champ: 'مبلغ الدفعة', ancienne: '⁦5 000 DH⁩', nouvelle: '⁦6 000 DH⁩' },
    ])
  })

  it('versement — ancien nom d\'action (corrections enregistrées avant le 2026-08-09) : même correspondance', () => {
    const changements = changementsHistorique(
      'billing_receipt.first_payment_method_corrected',
      { montantDh: 12000, nature: 'cash' },
      { montantDh: 9000, nature: 'cash' },
    )
    expect(changements).toEqual([
      { champ: 'مبلغ الدفعة', ancienne: '⁦12 000 DH⁩', nouvelle: '⁦9 000 DH⁩' },
    ])
  })

  it('versement — passage espèces vers chèque : instrument inclus, banque et référence en clair', () => {
    const changements = changementsHistorique(
      'billing_receipt.payment_method_corrected',
      { montantDh: 5000, nature: 'cash' },
      {
        montantDh: 5000,
        nature: 'cheque',
        reference: '556677',
        banque: 'بنك الشعبي',
        dateInstrument: '02/07/2026',
        payeur: 'نورة السوسي',
      },
    )
    const champs = changements.map((c) => c.champ)
    expect(champs).toContain('طريقة الدفع')
    expect(champs).toContain('رقم الشيك / المرجع')
    expect(champs).toContain('البنك')
    const nature = changements.find((c) => c.champ === 'طريقة الدفع')
    expect(nature).toEqual({ champ: 'طريقة الدفع', ancienne: 'نقد', nouvelle: 'شيك' })
  })

  it('dossier : aucune correspondance aujourd\'hui — liste vide, jamais une erreur', () => {
    const changements = changementsHistorique(
      'billing_receipt.dossier_updated',
      { },
      { },
    )
    expect(changements).toEqual([])
  })

  it('type d\'action inconnu : liste vide, ne lève jamais', () => {
    expect(() =>
      changementsHistorique('quelque.chose.inattendu', {}, {}),
    ).not.toThrow()
    expect(changementsHistorique('quelque.chose.inattendu', {}, {})).toEqual([])
  })
})
