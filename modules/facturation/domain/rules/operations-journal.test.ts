import { describe, expect, it } from 'vitest'

import type { LigneJournalOperations } from '../types'
import { apparierSessions, libelleActionJournal, limitesSemaine, semaineDecalee } from './operations-journal'

function ligne(
  id: string,
  date: string,
  heure: string,
  employe: string,
  employeSlot: number | null,
  typeAction = 'facturation_session.login_succeeded',
): LigneJournalOperations {
  return {
    id,
    date,
    heure,
    nature: '',
    typeAction,
    changements: [],
    employe,
    employeSlot,
  }
}

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
    expect(libelleActionJournal('facturation_session.login_succeeded')).toBe('دخول')
    expect(libelleActionJournal('facturation_session.login_failed')).toBe('محاولة دخول فاشلة')
    expect(libelleActionJournal('facturation_session.logout')).toBe('خروج')
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

describe('apparierSessions — connexion à déconnexion, jamais deux lignes séparées', () => {
  it('une connexion et sa déconnexion : appariées avec la durée exacte', () => {
    const sessions = apparierSessions(
      [ligne('c1', '09/08/2026', '08:00', 'Administrateur', 1)],
      [ligne('d1', '09/08/2026', '10:30', 'Administrateur', 1)],
    )
    expect(sessions).toEqual([
      {
        id: 'c1',
        employe: 'Administrateur',
        employeSlot: 1,
        connexionDate: '09/08/2026',
        connexionHeure: '08:00',
        deconnexionDate: '09/08/2026',
        deconnexionHeure: '10:30',
        dureeMinutes: 150,
      },
    ])
  })

  it('connexion sans déconnexion trouvée : reste ouverte, jamais de donnée inventée', () => {
    const sessions = apparierSessions([ligne('c1', '09/08/2026', '08:00', 'Employé 1', 2)], [])
    expect(sessions).toEqual([
      {
        id: 'c1',
        employe: 'Employé 1',
        employeSlot: 2,
        connexionDate: '09/08/2026',
        connexionHeure: '08:00',
      },
    ])
  })

  it('déconnexion sans connexion trouvée : connecté avant le début de la semaine affichée', () => {
    const sessions = apparierSessions([], [ligne('d1', '03/08/2026', '09:00', 'Employé 1', 2)])
    expect(sessions).toEqual([
      {
        id: 'd1',
        employe: 'Employé 1',
        employeSlot: 2,
        deconnexionDate: '03/08/2026',
        deconnexionHeure: '09:00',
      },
    ])
  })

  it('deux employés distincts : jamais mélangés entre eux', () => {
    const sessions = apparierSessions(
      [
        ligne('c1', '09/08/2026', '08:00', 'Administrateur', 1),
        ligne('c2', '09/08/2026', '08:05', 'Employé 1', 2),
      ],
      [
        ligne('d1', '09/08/2026', '12:00', 'Administrateur', 1),
        ligne('d2', '09/08/2026', '12:05', 'Employé 1', 2),
      ],
    )
    expect(sessions).toHaveLength(2)
    expect(sessions.find((s) => s.employeSlot === 1)?.dureeMinutes).toBe(240)
    expect(sessions.find((s) => s.employeSlot === 2)?.dureeMinutes).toBe(240)
  })

  it('reconnexion sans déconnexion entre les deux : la première session reste ouverte', () => {
    const sessions = apparierSessions(
      [
        ligne('c1', '09/08/2026', '08:00', 'Administrateur', 1),
        ligne('c2', '09/08/2026', '09:00', 'Administrateur', 1),
      ],
      [ligne('d1', '09/08/2026', '10:00', 'Administrateur', 1)],
    )
    expect(sessions).toEqual([
      // La plus récente en tête (R-86).
      {
        id: 'c2',
        employe: 'Administrateur',
        employeSlot: 1,
        connexionDate: '09/08/2026',
        connexionHeure: '09:00',
        deconnexionDate: '09/08/2026',
        deconnexionHeure: '10:00',
        dureeMinutes: 60,
      },
      {
        id: 'c1',
        employe: 'Administrateur',
        employeSlot: 1,
        connexionDate: '09/08/2026',
        connexionHeure: '08:00',
      },
    ])
  })

  it('ignore une ligne sans poste (echec de connexion, employeSlot null)', () => {
    const sessions = apparierSessions([ligne('c1', '09/08/2026', '08:00', 'غير معروف', null)], [])
    expect(sessions).toEqual([])
  })

  it('la plus récente session en tête, plusieurs jours', () => {
    const sessions = apparierSessions(
      [
        ligne('c1', '03/08/2026', '08:00', 'Administrateur', 1),
        ligne('c2', '05/08/2026', '08:00', 'Administrateur', 1),
      ],
      [
        ligne('d1', '03/08/2026', '17:00', 'Administrateur', 1),
        ligne('d2', '05/08/2026', '17:00', 'Administrateur', 1),
      ],
    )
    expect(sessions.map((s) => s.connexionDate)).toEqual(['05/08/2026', '03/08/2026'])
  })
})
