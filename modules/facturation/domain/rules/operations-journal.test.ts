import { describe, expect, it } from 'vitest'

import { libelleActionJournal, limitesSemaine, semaineDecalee } from './operations-journal'

describe('limitesSemaine — bornes lundi–dimanche', () => {
  it('un lundi est déjà le début de sa semaine', () => {
    expect(limitesSemaine('2026-08-03')).toEqual({ debut: '2026-08-03', fin: '2026-08-09' })
  })

  it('un dimanche appartient à la semaine qui a commencé le lundi précédent', () => {
    expect(limitesSemaine('2026-08-09')).toEqual({ debut: '2026-08-03', fin: '2026-08-09' })
  })

  it('un jour en milieu de semaine retombe sur les mêmes bornes', () => {
    expect(limitesSemaine('2026-08-06')).toEqual({ debut: '2026-08-03', fin: '2026-08-09' })
  })
})

describe('semaineDecalee — navigation pas à pas, jamais de date libre', () => {
  const semaineCourante = { debut: '2026-08-03', fin: '2026-08-09' }

  it('avance d’une semaine', () => {
    expect(semaineDecalee(semaineCourante, 1)).toEqual({ debut: '2026-08-10', fin: '2026-08-16' })
  })

  it('recule d’une semaine', () => {
    expect(semaineDecalee(semaineCourante, -1)).toEqual({ debut: '2026-07-27', fin: '2026-08-02' })
  })
})

describe('libelleActionJournal — un type, un seul libellé, jamais de vocabulaire neuf', () => {
  it('types non-modification : libellés repris tels quels du reste de l’écran', () => {
    expect(libelleActionJournal('billing_receipt.created')).toBe('إنشاء وصل')
    expect(libelleActionJournal('billing_receipt.first_payment_added')).toBe('إضافة دفعة')
    expect(libelleActionJournal('billing_receipt.payment_added')).toBe('إضافة دفعة')
    expect(libelleActionJournal('billing_receipt.cancelled')).toBe('إلغاء الوصل')
    expect(libelleActionJournal('billing_receipt.receipt_printed')).toBe('طباعة الوصل')
    expect(libelleActionJournal('payment_operation.over_allocation_confirmed')).toBe(
      'تجاوز المبلغ المتبقي للعملية',
    )
    expect(libelleActionJournal('facturation_finance_anomaly.anomaly_acknowledged')).toBe(
      'تأكيد مراجعة التنبيه',
    )
    expect(libelleActionJournal('facturation_finance_print.finance_journal_printed')).toBe(
      'طباعة السجل المالي',
    )
  })

  it('modification de reçu : libellé de la section touchée, comme le Journal financier', () => {
    expect(libelleActionJournal('billing_receipt.identity_updated')).toBe('الهوية')
    expect(libelleActionJournal('billing_receipt.phone_updated')).toBe('الهاتف')
    expect(libelleActionJournal('billing_receipt.commercial_data_updated')).toBe('البرنامج والسعر')
    expect(libelleActionJournal('billing_receipt.payment_method_corrected')).toBe('طريقة الدفعة')
  })

  it('type inconnu : ne lève jamais, retombe sur le libellé par défaut de sectionDepuisActionType', () => {
    expect(libelleActionJournal('quelque_chose_inconnu')).toBe('الملاحظة')
  })
})
